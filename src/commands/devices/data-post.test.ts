import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});
const successMSGMock = vi.fn();
const pickDeviceIDFromTagoIOMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount>;
const deviceInstance = { sendData: vi.fn(), info: vi.fn() };

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return accountInstance;
  },
  Device: function Device() {
    return deviceInstance;
  },
}));

vi.mock("./device-sender.js", () => ({
  getDeviceForSending: vi.fn(async () => deviceInstance),
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
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

describe("postDeviceData", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    successMSGMock.mockClear();
    deviceInstance.sendData.mockReset();
    deviceInstance.info.mockReset();
    pickDeviceIDFromTagoIOMock.mockReset();
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { postDeviceData } = await import("./data-post.js");
    await expect(postDeviceData("dev-id", { environment: "prod", post: "[]" })).rejects.toThrow(/Environment not found/);
  });

  test("sends the parsed JSON payload via a device token instance", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "dev-id" });
    deviceInstance.sendData.mockResolvedValue({ ok: 1 });

    const { postDeviceData } = await import("./data-post.js");
    await postDeviceData("dev-id", { environment: "prod", post: '[{"variable":"temp","value":20}]' });

    expect(deviceInstance.sendData).toHaveBeenCalledWith([{ variable: "temp", value: 20 }]);
    expect(successMSGMock).toHaveBeenCalled();
  });

  test("prompts for device id when idOrToken is empty", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValue("picked-id");
    accountInstance.devices.info.mockResolvedValue({ id: "picked-id" });
    deviceInstance.sendData.mockResolvedValue({ ok: 1 });

    const { postDeviceData } = await import("./data-post.js");
    await postDeviceData("", { environment: "prod", post: "[]" });
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalled();
  });

  test("falls back to Device token lookup when account lookup fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockRejectedValue(new Error("404"));
    deviceInstance.info.mockResolvedValue({ id: "dev-from-token" });
    deviceInstance.sendData.mockResolvedValue({ ok: 1 });

    const { postDeviceData } = await import("./data-post.js");
    await postDeviceData("some-token", { environment: "prod", post: "[]" });
    expect(deviceInstance.info).toHaveBeenCalled();
    expect(deviceInstance.sendData).toHaveBeenCalledWith([]);
  });

  test("returns silently when both account and device lookup fail", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockRejectedValue(new Error("404"));
    deviceInstance.info.mockRejectedValue(new Error("404 too"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { postDeviceData } = await import("./data-post.js");
    const result = await postDeviceData("bad-id", { environment: "prod", post: "[]" });
    expect(result).toBeUndefined();
  });
});
