import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchStreamResponse } from "../../../test-utils/mock-fetch.js";
import { makeEnvironmentConfig } from "../../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});

const resourcesProfilesInfoMock = vi.fn();
const fetchBackupsMock = vi.fn();
const selectBackupMock = vi.fn();
const promptCredentialsMock = vi.fn();
const getDownloadUrlMock = vi.fn();
const handleBackupErrorMock = vi.fn();
let fetchMock: ReturnType<typeof installFetchMock>;
const pipelineMock = vi.fn();
const mkdirSyncMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return {
      profiles: {
        info: (...args: unknown[]) => resourcesProfilesInfoMock(...args),
      },
    };
  },
}));

vi.mock("ora", () => ({
  default: () => ({
    start: () => ({ succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

vi.mock("node:fs", () => ({
  mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
  createWriteStream: vi.fn(() => ({})),
}));

vi.mock("node:stream/promises", () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
}));

vi.mock("./lib.js", () => ({
  fetchBackups: (...args: unknown[]) => fetchBackupsMock(...args),
  selectBackup: (...args: unknown[]) => selectBackupMock(...args),
  promptCredentials: (...args: unknown[]) => promptCredentialsMock(...args),
  getDownloadUrl: (...args: unknown[]) => getDownloadUrlMock(...args),
  handleBackupError: (...args: unknown[]) => handleBackupErrorMock(...args),
  formatDate: (d: string) => d,
  formatFileSize: (n: number) => `${n}B`,
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

describe("downloadBackup", () => {
  beforeEach(() => {
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    resourcesProfilesInfoMock.mockReset();
    fetchBackupsMock.mockReset();
    selectBackupMock.mockReset();
    promptCredentialsMock.mockReset();
    getDownloadUrlMock.mockReset();
    handleBackupErrorMock.mockReset();
    fetchMock = installFetchMock();
    pipelineMock.mockReset();
    mkdirSyncMock.mockReset();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { downloadBackup } = await import("./download.js");
    await expect(downloadBackup()).rejects.toThrow(/Environment not found/);
  });

  test("returns silently when profile info fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesProfilesInfoMock.mockRejectedValue(new Error("denied"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { downloadBackup } = await import("./download.js");
    const result = await downloadBackup();
    expect(result).toBeUndefined();
  });

  test("returns silently when no backup is selected", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesProfilesInfoMock.mockResolvedValue({ info: { id: "p1", name: "Prof" } });
    fetchBackupsMock.mockResolvedValue([]);
    selectBackupMock.mockResolvedValue(null);

    const { downloadBackup } = await import("./download.js");
    const result = await downloadBackup();
    expect(result).toBeUndefined();
    expect(promptCredentialsMock).not.toHaveBeenCalled();
  });

  test("returns silently when credentials are not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesProfilesInfoMock.mockResolvedValue({ info: { id: "p1", name: "Prof" } });
    fetchBackupsMock.mockResolvedValue([]);
    selectBackupMock.mockResolvedValue({ id: "b1", created_at: "2026-01-01", file_size: 100 });
    promptCredentialsMock.mockResolvedValue(null);

    const { downloadBackup } = await import("./download.js");
    const result = await downloadBackup();
    expect(result).toBeUndefined();
    expect(getDownloadUrlMock).not.toHaveBeenCalled();
  });

  test("downloads backup when all steps succeed", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesProfilesInfoMock.mockResolvedValue({ info: { id: "p1", name: "Prof" } });
    fetchBackupsMock.mockResolvedValue([]);
    selectBackupMock.mockResolvedValue({ id: "b1", created_at: "2026-01-01", file_size: 100 });
    promptCredentialsMock.mockResolvedValue({ email: "a@b.c", password: "x" });
    getDownloadUrlMock.mockResolvedValue({
      url: "http://download/x",
      fileSizeMb: 5,
      expireAt: "2026-01-02",
    });
    const webStream = new ReadableStream<Uint8Array>({ start: (c) => c.close() });
    fetchMock.mockResolvedValue(makeFetchStreamResponse(webStream));
    pipelineMock.mockResolvedValue(undefined);

    const { downloadBackup } = await import("./download.js");
    await downloadBackup();
    expect(pipelineMock).toHaveBeenCalled();
  });

  test("routes errors through handleBackupError", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesProfilesInfoMock.mockResolvedValue({ info: { id: "p1", name: "Prof" } });
    fetchBackupsMock.mockRejectedValue(new Error("network"));

    const { downloadBackup } = await import("./download.js");
    await downloadBackup();
    expect(handleBackupErrorMock).toHaveBeenCalled();
  });
});
