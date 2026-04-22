import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchResponse } from "../../../test-utils/mock-fetch.js";
import { makeEnvironmentConfig } from "../../../test-utils/mock-config.js";
import { makeAccount } from "../../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const handleBackupErrorMock = vi.fn();
let fetchMock: ReturnType<typeof installFetchMock>;

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

vi.mock("ora", () => ({
  default: () => ({
    start: () => ({ text: "", succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

vi.mock("./lib.js", () => ({
  handleBackupError: handleBackupErrorMock,
}));

vi.mock("../../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

describe("createBackup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    handleBackupErrorMock.mockClear();
    fetchMock = installFetchMock();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { createBackup } = await import("./create.js");
    await expect(createBackup()).rejects.toThrow(/Environment not found/);
  });

  test("returns early when the profile cannot be resolved", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockRejectedValue(new Error("no profile"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { createBackup } = await import("./create.js");
    const result = await createBackup();
    expect(result).toBeUndefined();
  });

  test("completes successfully when backup finishes on first poll", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockResolvedValue({ info: { id: "p1", name: "Profile" } });
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        return Promise.resolve(makeFetchResponse({ id: "b1" }));
      }
      return Promise.resolve(makeFetchResponse({ result: [{ id: "b1", status: "completed" }] }));
    });

    const { createBackup } = await import("./create.js");
    const promise = createBackup();
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalled();
  });

  test("returns null when backup status is failed", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockResolvedValue({ info: { id: "p1", name: "Profile" } });
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        return Promise.resolve(makeFetchResponse({ id: "b1" }));
      }
      return Promise.resolve(
        makeFetchResponse({ result: [{ id: "b1", status: "failed", error_message: "disk full" }] }),
      );
    });

    const { createBackup } = await import("./create.js");
    const promise = createBackup();
    await vi.runAllTimersAsync();
    await promise;
    expect(handleBackupErrorMock).not.toHaveBeenCalled();
  });

  test("routes fetch failure through handleBackupError", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.profiles.info.mockResolvedValue({ info: { id: "p1", name: "Profile" } });
    fetchMock.mockRejectedValue(new Error("network"));

    const { createBackup } = await import("./create.js");
    const promise = createBackup();
    await vi.runAllTimersAsync();
    await promise;
    expect(handleBackupErrorMock).toHaveBeenCalled();
  });
});
