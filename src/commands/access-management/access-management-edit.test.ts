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
const pickAccessIDMock = vi.fn();

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
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-access-id-from-tagoio.js", () => ({
  pickAccessIDFromTagoIO: pickAccessIDMock,
}));

const PERMISSIONS = JSON.stringify([{ effect: "allow", action: ["edit"], resource: ["dashboard"] }]);
const TARGETS = JSON.stringify([["run_user", "id", "usr1"]]);

describe("accessManagementEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickAccessIDMock.mockReset().mockResolvedValue("acc1");
    resourcesInstance.accessManagement.edit.mockResolvedValue("Access Management Successfully Updated");
    resourcesInstance.accessManagement.info.mockResolvedValue({
      id: "acc1",
      name: "Policy",
      tags: [{ key: "env", value: "prod" }],
    });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { accessManagementEdit } = await import("./access-management-edit.js");
    await expect(accessManagementEdit("acc1", { name: "New", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("prompts for the policy when the id is omitted", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit(undefined, { name: "New", tagkey: [], tagvalue: [] } as never);

    expect(pickAccessIDMock).toHaveBeenCalled();
    expect(resourcesInstance.accessManagement.edit).toHaveBeenCalledWith("acc1", expect.objectContaining({ name: "New" }));
  });

  test("--silent without an id fails and never prompts", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await expect(accessManagementEdit(undefined, { name: "New", silent: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/missing_input/);

    expect(pickAccessIDMock).not.toHaveBeenCalled();
  });

  test("--name reaches the payload alone", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { name: "Renamed", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1]).toEqual({ name: "Renamed" });
  });

  /** Probed: every edit field persists — no silently discarded field here. */
  test("--permissions replaces the permission set", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { permissions: PERMISSIONS, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1].permissions).toEqual(JSON.parse(PERMISSIONS));
  });

  test("--targets replaces the target set", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { targets: TARGETS, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1].targets).toEqual(JSON.parse(TARGETS));
  });

  /** Replacing must not pay for a lookup it does not use. */
  test("replacing permissions does not read the policy first", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { permissions: PERMISSIONS, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.info).not.toHaveBeenCalled();
  });

  test("--activate sets active true", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { activate: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1].active).toBe(true);
  });

  test("--deactivate sets active false", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { deactivate: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1].active).toBe(false);
  });

  test("--activate and --deactivate together fail before any call", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await expect(accessManagementEdit("acc1", { activate: true, deactivate: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.accessManagement.edit).not.toHaveBeenCalled();
  });

  test("--merge-tags preserves tags absent from the command line", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { mergeTags: true, tagkey: ["extra"], tagvalue: ["yes"] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1].tags).toEqual([
      { key: "env", value: "prod" },
      { key: "extra", value: "yes" },
    ]);
  });

  test("without --merge-tags the tag set is replaced and info is not called", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { tagkey: ["only"], tagvalue: ["this"] } as never);

    expect(resourcesInstance.accessManagement.edit.mock.calls[0][1].tags).toEqual([{ key: "only", value: "this" }]);
    expect(resourcesInstance.accessManagement.info).not.toHaveBeenCalled();
  });

  test("an invalid effect fails offline, before any call", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    const bad = JSON.stringify([{ effect: "maybe", action: ["access"], resource: ["device"] }]);

    await expect(accessManagementEdit("acc1", { permissions: bad, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_effect/);

    expect(resourcesInstance.accessManagement.edit).not.toHaveBeenCalled();
  });

  test("an empty target list fails offline", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");

    await expect(accessManagementEdit("acc1", { targets: "[]", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/empty_targets/);
  });

  test("an empty patch fails without a request", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await expect(accessManagementEdit("acc1", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.accessManagement.edit).not.toHaveBeenCalled();
  });

  test("--json synthesizes an ack, since the SDK resolves a plain string", async () => {
    const { accessManagementEdit } = await import("./access-management-edit.js");
    await accessManagementEdit("acc1", { name: "New", json: true, tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "acc1", updated: true });
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.accessManagement.edit.mockRejectedValue(new Error("boom"));

    const { accessManagementEdit } = await import("./access-management-edit.js");
    await expect(accessManagementEdit("acc1", { name: "New", json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:edit_failed:/);
  });
});
