import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, successMSGMock, infoMSGMock, uploadFolderMock, statSyncMock, existsSyncMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  successMSGMock: vi.fn(),
  infoMSGMock: vi.fn(),
  uploadFolderMock: vi.fn(),
  statSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { id: "resources-instance" };
  },
}));

vi.mock("node:fs", () => ({
  statSync: (...args: unknown[]) => statSyncMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
  infoMSG: infoMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

vi.mock("../../lib/upload-folder.js", () => ({
  uploadFolder: (...args: unknown[]) => uploadFolderMock(...args),
}));

import { uploadFilesCommand } from "./upload.js";

describe("uploadFilesCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ isDirectory: () => true });
    uploadFolderMock.mockResolvedValue({ created: 3, failed: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uploads a folder to the given remote path", async () => {
    await uploadFilesCommand("./widgets/_dist/line-chart", "custom-widgets/line-chart", { public: true });

    expect(uploadFolderMock).toHaveBeenCalledTimes(1);
    const params = uploadFolderMock.mock.calls[0][0];
    expect(params.localPath).toBe("./widgets/_dist/line-chart");
    expect(params.remotePath).toBe("custom-widgets/line-chart");
    expect(params.public).toBe(true);
  });

  test("defaults remotePath to the basename of localPath", async () => {
    await uploadFilesCommand("./widgets/_dist/line-chart", undefined, {});

    const params = uploadFolderMock.mock.calls[0][0];
    expect(params.remotePath).toBe("line-chart");
  });

  test("defaults public to false when the flag is absent", async () => {
    await uploadFilesCommand("./dir", "remote", {});

    expect(uploadFolderMock.mock.calls[0][0].public).toBe(false);
  });

  test("fails fast when localPath does not exist", async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(uploadFilesCommand("./missing", undefined, {})).rejects.toThrow(/not found|does not exist/i);
    expect(uploadFolderMock).not.toHaveBeenCalled();
  });

  test("fails fast when no profile token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(uploadFilesCommand("./dir", undefined, {})).rejects.toThrow(/token/i);
    expect(uploadFolderMock).not.toHaveBeenCalled();
  });

  test("uses the --token override when provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await uploadFilesCommand("./dir", "remote", { token: "cli-token" });

    expect(uploadFolderMock).toHaveBeenCalledTimes(1);
  });
});
