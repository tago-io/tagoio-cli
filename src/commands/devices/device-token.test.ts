import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, _code?: string) => {
  throw new Error(`json:${message}`);
});
const pickDeviceIDMock = vi.fn();

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

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: pickDeviceIDMock,
}));

describe("deviceToken", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickDeviceIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--create sends expire_time never and default full permission", async () => {
    resourcesInstance.devices.tokenCreate.mockResolvedValue({ token: "tok-1", permission: "full" });

    const { deviceToken } = await import("./device-token.js");
    await deviceToken("dev-1", { create: "My Token" } as never);

    expect(resourcesInstance.devices.tokenCreate).toHaveBeenCalledWith(
      "dev-1",
      expect.objectContaining({ name: "My Token", permission: "full", expire_time: "never" }),
    );
  });

  test("--create honors --permission", async () => {
    resourcesInstance.devices.tokenCreate.mockResolvedValue({ token: "tok-2", permission: "read" });

    const { deviceToken } = await import("./device-token.js");
    await deviceToken("dev-1", { create: "Reader", permission: "read" } as never);

    expect(resourcesInstance.devices.tokenCreate).toHaveBeenCalledWith(
      "dev-1",
      expect.objectContaining({ permission: "read" }),
    );
  });

  test("--create --json emits {token, name}", async () => {
    resourcesInstance.devices.tokenCreate.mockResolvedValue({ token: "tok-j", permission: "full" });

    const { deviceToken } = await import("./device-token.js");
    await deviceToken("dev-1", { create: "JTok", json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ token: "tok-j", name: "JTok" });
  });

  test("--delete removes the token", async () => {
    resourcesInstance.devices.tokenDelete.mockResolvedValue("removed");

    const { deviceToken } = await import("./device-token.js");
    await deviceToken("dev-1", { delete: "tok-del" } as never);

    expect(resourcesInstance.devices.tokenDelete).toHaveBeenCalledWith("tok-del");
  });

  test("--delete --json emits {token, deleted:true}", async () => {
    resourcesInstance.devices.tokenDelete.mockResolvedValue("removed");

    const { deviceToken } = await import("./device-token.js");
    await deviceToken("dev-1", { delete: "tok-d", json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ token: "tok-d", deleted: true });
  });

  test("no op flag lists tokens (default)", async () => {
    const tokens = [{ name: "T1", token: "t1", permission: "full" }];
    resourcesInstance.devices.tokenList.mockResolvedValue(tokens);

    const { deviceToken } = await import("./device-token.js");
    await deviceToken("dev-1", { json: true } as never);

    expect(resourcesInstance.devices.tokenList).toHaveBeenCalledWith("dev-1");
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual(tokens);
  });

  test("--silent with no id errors with missing_input", async () => {
    const { deviceToken } = await import("./device-token.js");
    await expect(deviceToken(undefined, { create: "x", silent: true, json: true } as never)).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("id"), "missing_input");
  });

  test("SDK failure on create routes through errorHandler", async () => {
    resourcesInstance.devices.tokenCreate.mockRejectedValue(new Error("boom"));

    const { deviceToken } = await import("./device-token.js");
    await expect(deviceToken("dev-x", { create: "x" } as never)).rejects.toThrow(/Failed to create token: boom/);
  });
});
