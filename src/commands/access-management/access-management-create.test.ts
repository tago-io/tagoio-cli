import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});

/**
 * Mirrors the real `requireOrFail`, including that it *prompts* when the value
 * is absent. A mock that skipped the prompt would leave `prompts.inject`
 * entries unconsumed and shift every later answer onto the wrong question.
 */
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string, opts: { silent?: boolean; json?: boolean } = {}) => {
  if (value) {
    return value;
  }
  if (opts.silent) {
    const message = `Missing required input: ${name}`;
    if (opts.json) {
      errorHandlerJSONMock(message, "missing_input");
    }
    errorHandlerMock(message);
  }
  const { input } = await prompts({ type: "text", name: "input", message: `Enter ${name}:` });
  if (!input) {
    errorHandlerMock(`Missing required input: ${name}`);
  }
  return input as string;
});

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  requireOrFail: requireOrFailMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

const PERMISSIONS = JSON.stringify([{ effect: "allow", action: ["access"], resource: ["device"] }]);
const TARGETS = JSON.stringify([["analysis", "id", "ana1"]]);

describe("accessManagementCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    // Probed: create resolves `{ am_id }`, not `{ id }`.
    resourcesInstance.accessManagement.create.mockResolvedValue({ am_id: "acc1" });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(accessManagementCreate("P", { permissions: PERMISSIONS, targets: TARGETS, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(
      /Environment not found/,
    );
  });

  test("sends the name, permissions and targets", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await accessManagementCreate("My Policy", {
      permissions: PERMISSIONS,
      targets: TARGETS,
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.accessManagement.create.mock.calls[0][0]).toMatchObject({
      name: "My Policy",
      permissions: JSON.parse(PERMISSIONS),
      targets: JSON.parse(TARGETS),
    });
  });

  /**
   * `create` resolves `{ am_id }` — the sixth distinct id key in this codebase,
   * after `{ device_id }`, `{ action }`, `{ dictionary }`, `{ user }` and
   * analyses' plain `{ id }`. Reading `.id` would emit `undefined`.
   */
  test("--json reports the id read from response.am_id", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await accessManagementCreate("My Policy", {
      permissions: PERMISSIONS,
      targets: TARGETS,
      json: true,
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "acc1", name: "My Policy" });
  });

  test("--json reports the permission and target counts", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await accessManagementCreate("My Policy", {
      permissions: PERMISSIONS,
      targets: TARGETS,
      json: true,
      tagkey: [],
      tagvalue: [],
    } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.permissions_count).toBe(1);
    expect(parsed.targets_count).toBe(1);
  });

  /** Probed: a create without permissions fails `{'permissions':[{'message':'Required'}]}`. */
  test("missing --permissions fails offline naming the flag", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(accessManagementCreate("My Policy", { targets: TARGETS, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/--permissions/);

    expect(resourcesInstance.accessManagement.create).not.toHaveBeenCalled();
  });

  test("missing --targets fails offline naming the flag", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(accessManagementCreate("My Policy", { permissions: PERMISSIONS, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/--targets/);

    expect(resourcesInstance.accessManagement.create).not.toHaveBeenCalled();
  });

  test("an invalid effect fails offline, before any call", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    const bad = JSON.stringify([{ effect: "maybe", action: ["access"], resource: ["device"] }]);

    await expect(accessManagementCreate("My Policy", { permissions: bad, targets: TARGETS, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(
      /invalid_effect/,
    );

    expect(resourcesInstance.accessManagement.create).not.toHaveBeenCalled();
  });

  test("an empty target list fails offline", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");

    await expect(
      accessManagementCreate("My Policy", {
        permissions: PERMISSIONS,
        targets: "[]",
        tagkey: [],
        tagvalue: [],
      } as never),
    ).rejects.toThrow(/empty_targets/);
  });

  /**
   * The round-trip contract: `access-management-info --json` output must feed
   * straight back into this command, which is how a policy moves between
   * profiles.
   */
  test("a payload shaped like info --json output is accepted unchanged", async () => {
    const exported = {
      permissions: [
        { effect: "allow", action: ["access"], resource: ["device", "tag_match", "organization_id"] },
        { effect: "allow", action: ["create_notification"], resource: ["run_user"] },
      ],
      targets: [["run_user", "tag_match", "organization_id"]],
    };

    const { accessManagementCreate } = await import("./access-management-create.js");
    await accessManagementCreate("Copied Policy", {
      permissions: JSON.stringify(exported.permissions),
      targets: JSON.stringify(exported.targets),
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.accessManagement.create.mock.calls[0][0]).toMatchObject(exported);
  });

  test("--inactive creates a deactivated policy", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await accessManagementCreate("My Policy", {
      permissions: PERMISSIONS,
      targets: TARGETS,
      inactive: true,
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.accessManagement.create.mock.calls[0][0].active).toBe(false);
  });

  test("tags reach the payload", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await accessManagementCreate("My Policy", {
      permissions: PERMISSIONS,
      targets: TARGETS,
      tagkey: ["cli_test"],
      tagvalue: ["1"],
    } as never);

    expect(resourcesInstance.accessManagement.create.mock.calls[0][0].tags).toEqual([{ key: "cli_test", value: "1" }]);
  });

  /** An unknown action must reach the API, whose message names the valid set. */
  test("an unknown action is forwarded rather than rejected", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    const exotic = JSON.stringify([{ effect: "allow", action: ["some_future_action"], resource: ["device"] }]);

    await accessManagementCreate("My Policy", {
      permissions: exotic,
      targets: TARGETS,
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.accessManagement.create.mock.calls[0][0].permissions).toEqual(JSON.parse(exotic));
  });

  test("an API rejection reports create_failed carrying the API message", async () => {
    resourcesInstance.accessManagement.create.mockRejectedValue(new Error("resource must be an item of dashboard,device,run_user"));

    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(
      accessManagementCreate("My Policy", {
        permissions: PERMISSIONS,
        targets: TARGETS,
        tagkey: [],
        tagvalue: [],
      } as never),
    ).rejects.toThrow(/must be an item of/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.accessManagement.create.mockRejectedValue(new Error("boom"));

    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(
      accessManagementCreate("My Policy", {
        permissions: PERMISSIONS,
        targets: TARGETS,
        json: true,
        tagkey: [],
        tagvalue: [],
      } as never),
    ).rejects.toThrow(/^json:create_failed:/);
  });

  test("--silent without a name fails before any API call", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(
      accessManagementCreate(undefined, {
        permissions: PERMISSIONS,
        targets: TARGETS,
        silent: true,
        tagkey: [],
        tagvalue: [],
      } as never),
    ).rejects.toThrow(/Missing required input: name/);

    expect(resourcesInstance.accessManagement.create).not.toHaveBeenCalled();
  });

  /** The parseable code reaches the caller through the JSON channel. */
  test("--silent without a name reports missing_input in JSON mode", async () => {
    const { accessManagementCreate } = await import("./access-management-create.js");
    await expect(
      accessManagementCreate(undefined, {
        permissions: PERMISSIONS,
        targets: TARGETS,
        silent: true,
        json: true,
        tagkey: [],
        tagvalue: [],
      } as never),
    ).rejects.toThrow(/^json:missing_input:/);
  });
});
