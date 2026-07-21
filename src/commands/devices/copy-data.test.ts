import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const pickDeviceIDFromTagoIOMock = vi.fn();
const confirmPromptMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

const deviceInfoMock = vi.fn();

const sendDataMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
  Device: function Device() {
    return { info: deviceInfoMock };
  },
}));

vi.mock("./device-sender.js", () => ({
  getDeviceForSending: vi.fn(async () => ({ sendData: sendDataMock })),
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

const ID_FROM = "a".repeat(24);
const ID_TO = "b".repeat(24);

describe("copyDeviceData", () => {
  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    pickDeviceIDFromTagoIOMock.mockReset();
    confirmPromptMock.mockReset();
    deviceInfoMock.mockReset();
    sendDataMock.mockReset();
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { copyDeviceData } = await import("./copy-data.js");
    await expect(copyDeviceData({ from: ID_FROM, to: ID_TO, environment: "prod", amount: 10 })).rejects.toThrow(
      /Environment not found/,
    );
  });

  test("surfaces the error when a device info cannot be resolved", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.devices.info.mockRejectedValue(new Error("404"));

    const { copyDeviceData } = await import("./copy-data.js");
    await expect(copyDeviceData({ from: ID_FROM, to: ID_TO, environment: "prod", amount: 10 })).rejects.toThrow(/404/);
  });

  test("prompts for device IDs when from/to are not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValueOnce(ID_FROM).mockResolvedValueOnce(ID_TO);
    resourcesInstance.devices.info.mockResolvedValue({ id: ID_FROM, name: "Dev" });
    confirmPromptMock.mockResolvedValue(false);

    const { copyDeviceData } = await import("./copy-data.js");
    await copyDeviceData({ from: "", to: "", environment: "prod", amount: 10 });

    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalledTimes(2);
  });

  test("returns early when confirmPrompt is false", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.devices.info
      .mockResolvedValueOnce({ id: ID_FROM, name: "From" })
      .mockResolvedValueOnce({ id: ID_TO, name: "To" });
    confirmPromptMock.mockResolvedValue(false);

    const { copyDeviceData } = await import("./copy-data.js");
    const result = await copyDeviceData({ from: ID_FROM, to: ID_TO, environment: "prod", amount: 10 });

    expect(result).toBeUndefined();
    expect(confirmPromptMock).toHaveBeenCalled();
    expect(sendDataMock).not.toHaveBeenCalled();
  });

  test("streams from source and sends to destination when user confirms", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.devices.info
      .mockResolvedValueOnce({ id: ID_FROM, name: "From" })
      .mockResolvedValueOnce({ id: ID_TO, name: "To" });
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
    resourcesInstance.devices.getDeviceDataStreaming.mockReturnValue(stream());
    sendDataMock.mockResolvedValue(undefined);
    confirmPromptMock.mockResolvedValue(true);

    const { copyDeviceData } = await import("./copy-data.js");
    await copyDeviceData({ from: ID_FROM, to: ID_TO, environment: "prod", amount: 1 });

    expect(resourcesInstance.devices.getDeviceDataStreaming).toHaveBeenCalledWith(ID_FROM, {}, expect.any(Object));
    // The "payload" variable is filtered out before sending; data is written via the destination device token.
    expect(sendDataMock).toHaveBeenCalledWith([{ variable: "x", value: 1 }]);
  });
});
