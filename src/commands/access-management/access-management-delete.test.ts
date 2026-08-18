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

describe("accessManagementDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickAccessIDMock.mockReset().mockResolvedValue("acc1");
    resourcesInstance.accessManagement.info.mockResolvedValue({
      id: "acc1",
      name: "[TagoIO Permission for Analysis] - Alert Dispatch",
      permissions: [
        { effect: "allow", action: ["access"], resource: ["device"] },
        { effect: "allow", action: ["create_notification"], resource: ["run_user"] },
      ],
      targets: [["analysis", "id", "ana1"]],
    });
    resourcesInstance.accessManagement.delete.mockResolvedValue("Successfully Removed");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await expect(accessManagementDelete("acc1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("deletes after the confirmation is accepted", async () => {
    prompts.inject([true]);

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete("acc1", {} as never);

    expect(resourcesInstance.accessManagement.delete).toHaveBeenCalledWith("acc1");
  });

  test("declining makes no delete call", async () => {
    prompts.inject([false]);

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete("acc1", {} as never);

    expect(resourcesInstance.accessManagement.delete).not.toHaveBeenCalled();
  });

  /**
   * A policy's name says nothing about what it grants — this is the only family
   * where the confirmation needs a second API call to be honest. Asserted
   * through the exported builder, since a spy on `prompts.prompt` never
   * intercepts a direct `prompts(...)` call.
   */
  test("the confirmation names the policy", async () => {
    const { buildDeleteMessage } = await import("./access-management-delete.js");

    expect(buildDeleteMessage('access policy "Alert Dispatch"', 6, 1)).toContain("Alert Dispatch");
  });

  test("the confirmation states the permission count", async () => {
    const { buildDeleteMessage } = await import("./access-management-delete.js");

    expect(buildDeleteMessage('access policy "P"', 6, 1)).toMatch(/6 permissions/);
  });

  test("the confirmation states the target count", async () => {
    const { buildDeleteMessage } = await import("./access-management-delete.js");

    expect(buildDeleteMessage('access policy "P"', 6, 3)).toMatch(/3 targets/);
  });

  test("the counts are singular when there is one of each", async () => {
    const { buildDeleteMessage } = await import("./access-management-delete.js");

    expect(buildDeleteMessage('access policy "P"', 1, 1)).toMatch(/1 permission\b/);
    expect(buildDeleteMessage('access policy "P"', 1, 1)).toMatch(/1 target\b/);
  });

  /** Deactivating is the reversible alternative, and the prompt should say so. */
  test("the confirmation mentions deactivating instead", async () => {
    const { buildDeleteMessage } = await import("./access-management-delete.js");

    expect(buildDeleteMessage('access policy "P"', 2, 1)).toMatch(/deactivate/i);
  });

  test("the confirmation warns that access is lost immediately", async () => {
    const { buildDeleteMessage } = await import("./access-management-delete.js");

    expect(buildDeleteMessage('access policy "P"', 2, 1)).toMatch(/access/i);
  });

  test("describeTarget names the policy when the lookup succeeds", async () => {
    const { describeTarget } = await import("./access-management-delete.js");

    const described = await describeTarget(resourcesInstance as never, "acc1");
    expect(described.label).toContain("Alert Dispatch");
    expect(described.permissions).toBe(2);
    expect(described.targets).toBe(1);
  });

  /** A failed read must not block a delete. */
  test("describeTarget falls back to the id when the lookup fails", async () => {
    resourcesInstance.accessManagement.info.mockRejectedValue(new Error("nope"));

    const { describeTarget } = await import("./access-management-delete.js");

    const described = await describeTarget(resourcesInstance as never, "acc1");
    expect(described.label).toContain("acc1");
    expect(described.permissions).toBe(0);
  });

  test("a failed lookup still allows the delete", async () => {
    resourcesInstance.accessManagement.info.mockRejectedValue(new Error("nope"));
    prompts.inject([true]);

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete("acc1", {} as never);

    expect(resourcesInstance.accessManagement.delete).toHaveBeenCalledWith("acc1");
  });

  test("-y deletes without prompting", async () => {
    const promptSpy = vi.spyOn(prompts, "prompt");

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete("acc1", { yes: true } as never);

    expect(promptSpy).not.toHaveBeenCalled();
    expect(resourcesInstance.accessManagement.delete).toHaveBeenCalledWith("acc1");
  });

  test("--silent deletes without prompting", async () => {
    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete("acc1", { silent: true } as never);

    expect(resourcesInstance.accessManagement.delete).toHaveBeenCalledWith("acc1");
  });

  test("prompts for the policy when the id is omitted", async () => {
    prompts.inject([true]);

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete(undefined, {} as never);

    expect(pickAccessIDMock).toHaveBeenCalled();
    expect(resourcesInstance.accessManagement.delete).toHaveBeenCalledWith("acc1");
  });

  test("--silent without an id fails and deletes nothing", async () => {
    const { accessManagementDelete } = await import("./access-management-delete.js");
    await expect(accessManagementDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickAccessIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.accessManagement.delete).not.toHaveBeenCalled();
  });

  test("--json synthesizes an ack, since the SDK resolves a plain string", async () => {
    const { accessManagementDelete } = await import("./access-management-delete.js");
    await accessManagementDelete("acc1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "acc1", deleted: true });
  });

  test("an API rejection reports delete_failed", async () => {
    resourcesInstance.accessManagement.delete.mockRejectedValue(new Error("boom"));

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await expect(accessManagementDelete("acc1", { yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.accessManagement.delete.mockRejectedValue(new Error("boom"));

    const { accessManagementDelete } = await import("./access-management-delete.js");
    await expect(accessManagementDelete("acc1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
