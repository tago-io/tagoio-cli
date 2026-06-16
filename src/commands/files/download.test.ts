import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const {
  getEnvironmentConfigMock,
  errorHandlerMock,
  infoMSGMock,
  successMSGMock,
  listMock,
  profileInfoMock,
  checkPermissionMock,
  getSignedMock,
  mkdirMock,
  writeFileMock,
  fetchMock,
} = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  successMSGMock: vi.fn(),
  listMock: vi.fn(),
  profileInfoMock: vi.fn(),
  checkPermissionMock: vi.fn(),
  getSignedMock: vi.fn(),
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return {
      files: { list: listMock, checkPermission: checkPermissionMock, getFileURLSigned: getSignedMock },
      profiles: { info: profileInfoMock },
    };
  },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
  getApiURL: () => "https://api.us-e1.tago.io",
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
  successMSG: successMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

import { filesDownloadCommand } from "./download.js";

describe("filesDownloadCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    profileInfoMock.mockResolvedValue({ info: { id: "profile-1" } });
    checkPermissionMock.mockResolvedValue({ public: true });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("downloads a public file to the given destination", async () => {
    await filesDownloadCommand("reports/a.pdf", "./out/a.pdf", {});

    expect(fetchMock).toHaveBeenCalledWith("https://api.us-e1.tago.io/file/profile-1/reports/a.pdf");
    expect(getSignedMock).not.toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0][0]).toContain("a.pdf");
  });

  test("uses a signed URL for a private file", async () => {
    checkPermissionMock.mockResolvedValue({ public: false });
    getSignedMock.mockResolvedValue("https://signed.example/a.pdf?token=x");

    await filesDownloadCommand("reports/a.pdf", undefined, {});

    expect(getSignedMock).toHaveBeenCalledWith("https://api.us-e1.tago.io/file/profile-1/reports/a.pdf");
    expect(fetchMock).toHaveBeenCalledWith("https://signed.example/a.pdf?token=x");
  });

  test("defaults the destination to the basename in cwd", async () => {
    await filesDownloadCommand("reports/a.pdf", undefined, {});

    expect(writeFileMock.mock.calls[0][0]).toContain("a.pdf");
  });

  test("downloads a folder preserving structure", async () => {
    listMock.mockResolvedValue({
      files: [{ filename: "custom-widgets/lc/index.html" }, { filename: "custom-widgets/lc/sub/app.js" }],
      folders: [],
    });

    await filesDownloadCommand("custom-widgets/lc", "./dest", {});

    const written = writeFileMock.mock.calls.map((c) => String(c[0])).sort();
    expect(written.some((p) => p.includes("index.html"))).toBe(true);
    expect(written.some((p) => p.includes(`sub${"/"}app.js`) || p.includes("app.js"))).toBe(true);
    expect(writeFileMock).toHaveBeenCalledTimes(2);
  });

  test("errors when an empty folder has nothing to download", async () => {
    listMock.mockResolvedValue({ files: [], folders: [] });

    await expect(filesDownloadCommand("empty", "./dest", {})).rejects.toThrow(/no files|not found/i);
  });

  test("errors when the fetch fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(filesDownloadCommand("reports/a.pdf", "./out/a.pdf", {})).rejects.toThrow(/download|404|failed/i);
  });

  test("fails fast when no token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesDownloadCommand("a.pdf", undefined, {})).rejects.toThrow(/token/i);
  });
});
