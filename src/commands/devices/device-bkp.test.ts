import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchResponse } from "../../test-utils/mock-fetch.js";
import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const getDeviceMock = vi.fn();
const pickDeviceIDFromTagoIOMock = vi.fn();
const pickFileFromTagoIOMock = vi.fn();
const promptTextToEnterMock = vi.fn();
const uploadFileMock = vi.fn();
let fetchMock: ReturnType<typeof installFetchMock>;

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
  Device: function Device() {
    return { info: vi.fn().mockRejectedValue(new Error("no device")) };
  },
  Utils: {
    getDevice: (...args: unknown[]) => getDeviceMock(...args),
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
  highlightMSG: (s: string) => s,
}));

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: (...args: unknown[]) => pickDeviceIDFromTagoIOMock(...args),
}));

vi.mock("../../prompt/pick-files-from-tagoio.js", () => ({
  pickFileFromTagoIO: (...args: unknown[]) => pickFileFromTagoIOMock(...args),
}));

vi.mock("../../prompt/text-prompt.js", () => ({
  promptTextToEnter: (...args: unknown[]) => promptTextToEnterMock(...args),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
}));

describe("bkpDeviceData", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    getDeviceMock.mockReset();
    pickDeviceIDFromTagoIOMock.mockReset();
    pickFileFromTagoIOMock.mockReset();
    promptTextToEnterMock.mockReset();
    uploadFileMock.mockReset();
    fetchMock = installFetchMock();
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { bkpDeviceData } = await import("./device-bkp.js");
    await expect(
      bkpDeviceData("dev-id", { environment: "prod", restore: false, local: false }),
    ).rejects.toThrow(/Environment not found/);
  });

  test("stops silently when the device info cannot be resolved", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockRejectedValue(new Error("not found"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { bkpDeviceData } = await import("./device-bkp.js");
    const result = await bkpDeviceData("bad-id", { environment: "prod", restore: false, local: false });
    expect(result).toBeUndefined();
  });

  test("prompts for device id when idOrToken is empty", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValue("picked-id");
    accountInstance.devices.info.mockResolvedValue({
      id: "picked-id",
      name: "Picked",
      created_at: new Date("2026-01-01"),
    });
    getDeviceMock.mockResolvedValue({
      getData: vi.fn().mockResolvedValue([]),
    });
    promptTextToEnterMock.mockResolvedValue("./backup/file.json");
    uploadFileMock.mockResolvedValue(undefined);

    const { bkpDeviceData } = await import("./device-bkp.js");
    await bkpDeviceData("", { environment: "prod", restore: false, local: false });
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalled();
  });

  test("stops silently when getDevice returns null", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({
      id: "x",
      name: "X",
      created_at: new Date("2026-01-01"),
    });
    getDeviceMock.mockResolvedValue(null);

    const { bkpDeviceData } = await import("./device-bkp.js");
    const result = await bkpDeviceData("x", { environment: "prod", restore: false, local: false });
    expect(result).toBeUndefined();
  });

  test("restore path with remote file downloads JSON and uploads data", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "d1", name: "D1", created_at: new Date() });
    accountInstance.devices.emptyDeviceData.mockResolvedValue(undefined);
    const sendDataStreaming = vi.fn().mockResolvedValue(undefined);
    getDeviceMock.mockResolvedValue({ sendDataStreaming });
    pickFileFromTagoIOMock.mockResolvedValue("http://example/backup.json");
    fetchMock.mockResolvedValue(makeFetchResponse([{ variable: "a", value: 1 }]));

    const { bkpDeviceData } = await import("./device-bkp.js");
    await bkpDeviceData("d1", { environment: "prod", restore: true, local: false });
    expect(accountInstance.devices.emptyDeviceData).toHaveBeenCalledWith("d1");
    expect(sendDataStreaming).toHaveBeenCalled();
  });

  test("restore path errors out when remote file is not selected", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "d1", name: "D1", created_at: new Date() });
    getDeviceMock.mockResolvedValue({ sendDataStreaming: vi.fn() });
    pickFileFromTagoIOMock.mockResolvedValue("");

    const { bkpDeviceData } = await import("./device-bkp.js");
    await expect(
      bkpDeviceData("d1", { environment: "prod", restore: true, local: false }),
    ).rejects.toThrow(/No file selected/);
  });

  test("store path writes data locally when options.local is true", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({
      id: "d1",
      name: "D1",
      created_at: new Date("2026-03-01"),
    });
    const getData = vi.fn().mockResolvedValue([{ variable: "x", value: 1 }]);
    getDeviceMock.mockResolvedValue({ getData });

    const { bkpDeviceData } = await import("./device-bkp.js");
    await bkpDeviceData("d1", { environment: "prod", restore: false, local: true });
    expect(getData).toHaveBeenCalled();
  });
});
