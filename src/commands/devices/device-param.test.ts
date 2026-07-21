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

describe("deviceParam", () => {
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

  test("--set upserts params with sent=false by default", async () => {
    resourcesInstance.devices.paramSet.mockResolvedValue("ok");

    const { deviceParam } = await import("./device-param.js");
    await deviceParam("dev-1", { set: ["a=1", "b=2"] } as never);

    expect(resourcesInstance.devices.paramSet).toHaveBeenCalledWith("dev-1", [
      { key: "a", value: "1", sent: false },
      { key: "b", value: "2", sent: false },
    ]);
  });

  test("--sent marks set params as sent", async () => {
    resourcesInstance.devices.paramSet.mockResolvedValue("ok");

    const { deviceParam } = await import("./device-param.js");
    await deviceParam("dev-1", { set: ["a=1"], sent: true } as never);

    expect(resourcesInstance.devices.paramSet).toHaveBeenCalledWith("dev-1", [{ key: "a", value: "1", sent: true }]);
  });

  test("value may contain '=' (split on first only)", async () => {
    resourcesInstance.devices.paramSet.mockResolvedValue("ok");

    const { deviceParam } = await import("./device-param.js");
    await deviceParam("dev-1", { set: ["url=https://x.io/a=b"] } as never);

    expect(resourcesInstance.devices.paramSet).toHaveBeenCalledWith("dev-1", [
      { key: "url", value: "https://x.io/a=b", sent: false },
    ]);
  });

  test("malformed --set (no '=') errors with invalid_param", async () => {
    const { deviceParam } = await import("./device-param.js");
    await expect(deviceParam("dev-1", { set: ["broken"], json: true } as never)).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("broken"), "invalid_param");
    expect(resourcesInstance.devices.paramSet).not.toHaveBeenCalled();
  });

  test("--delete removes a param by id", async () => {
    resourcesInstance.devices.paramRemove.mockResolvedValue("removed");

    const { deviceParam } = await import("./device-param.js");
    await deviceParam("dev-1", { delete: "param-1" } as never);

    expect(resourcesInstance.devices.paramRemove).toHaveBeenCalledWith("dev-1", "param-1");
  });

  test("no op flag lists params (default)", async () => {
    const params = [{ id: "p1", key: "a", value: "1", sent: false }];
    resourcesInstance.devices.paramList.mockResolvedValue(params);

    const { deviceParam } = await import("./device-param.js");
    await deviceParam("dev-1", { json: true } as never);

    expect(resourcesInstance.devices.paramList).toHaveBeenCalledWith("dev-1");
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual(params);
  });

  test("--silent with no id errors with missing_input", async () => {
    const { deviceParam } = await import("./device-param.js");
    await expect(deviceParam(undefined, { set: ["a=1"], silent: true, json: true } as never)).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("id"), "missing_input");
  });

  test("SDK failure on set routes through errorHandler", async () => {
    resourcesInstance.devices.paramSet.mockRejectedValue(new Error("boom"));

    const { deviceParam } = await import("./device-param.js");
    await expect(deviceParam("dev-x", { set: ["a=1"] } as never)).rejects.toThrow(/Failed to set params: boom/);
  });
});
