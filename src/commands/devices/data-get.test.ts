import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

const accountDevicesInfoMock = vi.fn();
const utilsGetDeviceMock = vi.fn();
const deviceInfoMock = vi.fn();
const deviceGetDataMock = vi.fn();
const pickDeviceIDFromTagoIOMock = vi.fn();
const postDeviceDataMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return { devices: { info: (...args: unknown[]) => accountDevicesInfoMock(...args) } };
  },
  Device: function Device() {
    return {
      info: (...args: unknown[]) => deviceInfoMock(...args),
      getData: (...args: unknown[]) => deviceGetDataMock(...args),
    };
  },
  Utils: { getDevice: (...args: unknown[]) => utilsGetDeviceMock(...args) },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: (...args: unknown[]) => pickDeviceIDFromTagoIOMock(...args),
}));

vi.mock("./data-post.js", () => ({
  postDeviceData: (...args: unknown[]) => postDeviceDataMock(...args),
}));

describe("_createDataFilter", () => {
  test("creates filter from all options", async () => {
    const { _createDataFilter } = await import("./data-get.js");
    const filter = _createDataFilter({
      var: ["temperature", "humidity"],
      group: "daily",
      startDate: "2022-01-01",
      endDate: "2022-01-31",
      qty: "100",
      query: "avg",
    } as never);
    expect(filter).toEqual({
      variables: ["temperature", "humidity"],
      groups: "daily",
      start_date: "2022-01-01",
      end_date: "2022-01-31",
      qty: 100,
      query: "avg",
    });
  });

  test("returns empty object when no options provided", async () => {
    const { _createDataFilter } = await import("./data-get.js");
    expect(_createDataFilter({} as never)).toEqual({});
  });
});

describe("getDeviceData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock.mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
  });

  test("delegates to postDeviceData when options.post is set", async () => {
    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("device-id", { post: "{...}" } as never);
    expect(postDeviceDataMock).toHaveBeenCalledWith("device-id", { post: "{...}" });
  });

  test("calls errorHandler when environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { getDeviceData } = await import("./data-get.js");
    await expect(getDeviceData("id", { post: "" } as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches device data by token (36-char) and prints table", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceGetDataMock.mockResolvedValue([{ variable: "temp", value: 25 }]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const token = "a".repeat(36);
    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData(token, { post: "" } as never);

    expect(deviceInfoMock).toHaveBeenCalled();
    expect(deviceGetDataMock).toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalled();
    tableSpy.mockRestore();
  });

  test("fetches device by id when length is not 36", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountDevicesInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    utilsGetDeviceMock.mockResolvedValue({
      getData: deviceGetDataMock,
    });
    deviceGetDataMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("short-id", { post: "", json: true } as never);
    expect(accountDevicesInfoMock).toHaveBeenCalledWith("short-id");
  });

  test("uses stringify output when option is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceGetDataMock.mockResolvedValue([{ variable: "x", value: 1 }]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { post: "", stringify: true } as never);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("prompts for device id when not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValue("picked-id");
    accountDevicesInfoMock.mockResolvedValue({ id: "dev", name: "X", type: "mutable" });
    utilsGetDeviceMock.mockResolvedValue({ getData: deviceGetDataMock });
    deviceGetDataMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("", { post: "" } as never);
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalled();
  });
});
