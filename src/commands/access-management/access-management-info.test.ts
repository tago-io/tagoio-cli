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
  infoMSG: vi.fn(),
  writeStatus: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-access-id-from-tagoio.js", () => ({
  pickAccessIDFromTagoIO: pickAccessIDMock,
}));

describe("accessManagementInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const info = {
    id: "acc1",
    name: "[TagoIO Permission for Analysis] - Alert Dispatch",
    profile: "prof1",
    active: true,
    permissions: [
      { effect: "allow", action: ["access"], resource: ["device", "tag_match", "organization_id"] },
      { effect: "allow", action: ["create_notification"], resource: ["run_user"] },
    ],
    targets: [["analysis", "id", "ana1"]],
    tags: [{ key: "export_id", value: "alert_dispatch" }],
    created_at: new Date("2026-07-01T13:19:03.000Z"),
    updated_at: new Date("2026-07-01T13:19:05.000Z"),
  };

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickAccessIDMock.mockReset().mockResolvedValue("acc1");
    resourcesInstance.accessManagement.info.mockResolvedValue(info);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { accessManagementInfo } = await import("./access-management-info.js");
    await expect(accessManagementInfo("acc1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches the policy by the given id", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", {} as never);

    expect(resourcesInstance.accessManagement.info).toHaveBeenCalledWith("acc1");
  });

  test("prompts for the policy when the id is omitted", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo(undefined, {} as never);

    expect(pickAccessIDMock).toHaveBeenCalled();
    expect(resourcesInstance.accessManagement.info).toHaveBeenCalledWith("acc1");
  });

  test("--silent without an id fails and never prompts", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await expect(accessManagementInfo(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickAccessIDMock).not.toHaveBeenCalled();
  });

  /**
   * The export half of the round trip: this output feeds
   * `access-management-create --permissions`, which is how a policy moves
   * between profiles. The arrays must survive verbatim.
   */
  test("--json emits permissions verbatim, ready to feed back into create", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).permissions).toEqual(info.permissions);
  });

  test("--json emits targets verbatim", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).targets).toEqual(info.targets);
  });

  test("--json carries the identifying fields", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({
      id: "acc1",
      name: info.name,
      active: true,
    });
  });

  /**
   * `console.table` writes to stdout, which is reserved for machine-readable
   * output. Asserted with the real one in place — mocking it hides the leak.
   */
  test("the human view writes nothing to stdout", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", {} as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("a Date created_at renders without throwing", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).created_at).toBeTruthy();
  });

  test("--raw keeps the dates in ISO form", async () => {
    const { accessManagementInfo } = await import("./access-management-info.js");
    await accessManagementInfo("acc1", { json: true, raw: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).created_at).toBe("2026-07-01T13:19:03.000Z");
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.accessManagement.info.mockRejectedValue(new Error("not found"));

    const { accessManagementInfo } = await import("./access-management-info.js");
    await expect(accessManagementInfo("nope", {} as never)).rejects.toThrow(/not_found/);
  });

  test("an unknown id routes through the JSON channel when --json is set", async () => {
    resourcesInstance.accessManagement.info.mockRejectedValue(new Error("not found"));

    const { accessManagementInfo } = await import("./access-management-info.js");
    await expect(accessManagementInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
