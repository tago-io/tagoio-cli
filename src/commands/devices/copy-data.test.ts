import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const getDeviceMock = vi.fn();
const pickDeviceIDFromTagoIOMock = vi.fn();
const confirmPromptMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount>;

const deviceInfoMock = vi.fn();
const sendDataMock = vi.fn();
const getDataStreamingMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
  Device: function Device() {
    return { info: deviceInfoMock, sendData: sendDataMock, getDataStreaming: getDataStreamingMock };
  },
  Utils: {
    getDevice: (...args: unknown[]) => getDeviceMock(...args),
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

vi.mock("../../prompt/confirm.js", () => ({
  confirmPrompt: (...args: unknown[]) => confirmPromptMock(...args),
}));

describe("copyDeviceData", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    getDeviceMock.mockReset();
    pickDeviceIDFromTagoIOMock.mockReset();
    confirmPromptMock.mockReset();
    deviceInfoMock.mockReset();
    sendDataMock.mockReset();
    getDataStreamingMock.mockReset();
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { copyDeviceData } = await import("./copy-data.js");
    await expect(
      copyDeviceData({ from: "a".repeat(24), to: "b".repeat(24), environment: "prod", amount: 10 }),
    ).rejects.toThrow(/Environment not found/);
  });

  test("calls errorHandler when the destination device cannot be resolved", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    getDeviceMock.mockResolvedValue(null);

    const { copyDeviceData } = await import("./copy-data.js");
    await expect(
      copyDeviceData({ from: "a".repeat(24), to: "b".repeat(24), environment: "prod", amount: 10 }),
    ).rejects.toThrow(/Device not found/);
  });

  test("prompts for device IDs when from/to are not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValueOnce("from-id-aaaaaaaaaaaaaaaaaaaa"); // 24 chars
    pickDeviceIDFromTagoIOMock.mockResolvedValueOnce("to-id-aaaaaaaaaaaaaaaaaaaa"); // 26 chars
    getDeviceMock.mockResolvedValue(null);

    const { copyDeviceData } = await import("./copy-data.js");
    await expect(
      copyDeviceData({ from: "", to: "", environment: "prod", amount: 10 }),
    ).rejects.toThrow(/Device not found/);
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalledTimes(2);
  });

  test("returns early when confirmPrompt is false", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    const fromDevice = { info: vi.fn().mockResolvedValue({ name: "From" }) };
    const toDevice = { info: vi.fn().mockResolvedValue({ name: "To" }) };
    getDeviceMock.mockResolvedValueOnce(fromDevice).mockResolvedValueOnce(toDevice);
    confirmPromptMock.mockResolvedValue(false);

    const { copyDeviceData } = await import("./copy-data.js");
    const result = await copyDeviceData({
      from: "a".repeat(24),
      to: "b".repeat(24),
      environment: "prod",
      amount: 10,
    });
    expect(result).toBeUndefined();
    expect(confirmPromptMock).toHaveBeenCalled();
  });

  test("streams and sends data when user confirms", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    const streamChunks = [
      [
        { variable: "x", value: 1 },
        { variable: "payload", value: "skip" },
      ],
      [{ variable: "y", value: 2 }],
    ];
    async function* stream() {
      for (const chunk of streamChunks) {
        yield chunk;
      }
    }
    const fromDevice = {
      info: vi.fn().mockResolvedValue({ name: "From" }),
      getDataStreaming: vi.fn(() => stream()),
    };
    const toDevice = {
      info: vi.fn().mockResolvedValue({ name: "To" }),
      sendData: vi.fn().mockResolvedValue(undefined),
    };
    getDeviceMock.mockResolvedValueOnce(fromDevice).mockResolvedValueOnce(toDevice);
    confirmPromptMock.mockResolvedValue(true);

    const { copyDeviceData } = await import("./copy-data.js");
    await copyDeviceData({
      from: "a".repeat(24),
      to: "b".repeat(24),
      environment: "prod",
      amount: 1,
    });
    expect(toDevice.sendData).toHaveBeenCalled();
  });
});
