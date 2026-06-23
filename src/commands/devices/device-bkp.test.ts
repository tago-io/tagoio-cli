import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchResponse } from "../../test-utils/mock-fetch.js";
import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});
const pickDeviceIDFromTagoIOMock = vi.fn();
const pickFileFromTagoIOMock = vi.fn();
const promptTextToEnterMock = vi.fn();
const uploadFileMock = vi.fn();
let fetchMock: ReturnType<typeof installFetchMock>;

let accountInstance: ReturnType<typeof makeAccount>;

const sendDataStreamingMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return accountInstance;
  },
  Device: function Device() {
    return { info: vi.fn().mockRejectedValue(new Error("no device")) };
  },
  Utils: {
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
  },
}));

vi.mock("./device-sender.js", () => ({
  getDeviceForSending: vi.fn(async () => ({ sendDataStreaming: sendDataStreamingMock })),
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

vi.mock("../../lib/resolve-scope.js", () => ({
  resolveScope: () => ({
    scope: "local" as const,
    root: "/repo",
    configPath: "/repo/tagoconfig.json",
    envFilePath: "/repo/.tagoio/personal.env",
    configExists: true,
  }),
}));

vi.mock("../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
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
    await expect(bkpDeviceData("dev-id", { environment: "prod", restore: false, local: false })).rejects.toThrow(/Environment not found/);
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
    accountInstance.devices.getDeviceData.mockResolvedValue([]);
    promptTextToEnterMock.mockResolvedValue("./backup/file.json");
    uploadFileMock.mockResolvedValue(undefined);

    const { bkpDeviceData } = await import("./device-bkp.js");
    await bkpDeviceData("", { environment: "prod", restore: false, local: false });
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalled();
  });

  test("restore path with remote file downloads JSON and streams data back", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "d1", name: "D1", created_at: new Date() });
    accountInstance.devices.emptyDeviceData.mockResolvedValue(undefined);
    sendDataStreamingMock.mockResolvedValue(undefined);
    pickFileFromTagoIOMock.mockResolvedValue("http://example/backup.json");
    fetchMock.mockResolvedValue(makeFetchResponse([{ variable: "a", value: 1 }]));

    const { bkpDeviceData } = await import("./device-bkp.js");
    await bkpDeviceData("d1", { environment: "prod", restore: true, local: false });
    expect(accountInstance.devices.emptyDeviceData).toHaveBeenCalledWith("d1");
    // Restore writes through the device token instance, not the profile token.
    expect(sendDataStreamingMock).toHaveBeenCalledWith(expect.any(Array), expect.any(Object));
  });

  test("restore path errors out when remote file is not selected", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "d1", name: "D1", created_at: new Date() });
    pickFileFromTagoIOMock.mockResolvedValue("");

    const { bkpDeviceData } = await import("./device-bkp.js");
    await expect(bkpDeviceData("d1", { environment: "prod", restore: true, local: false })).rejects.toThrow(/No file selected/);
  });

  test("store path writes data locally when options.local is true", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({
      id: "d1",
      name: "D1",
      created_at: new Date("2026-03-01"),
    });
    accountInstance.devices.getDeviceData.mockResolvedValue([{ variable: "x", value: 1 }]);

    const { bkpDeviceData } = await import("./device-bkp.js");
    await bkpDeviceData("d1", { environment: "prod", restore: false, local: true });
    expect(accountInstance.devices.getDeviceData).toHaveBeenCalled();
  });
});
