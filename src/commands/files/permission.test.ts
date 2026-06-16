import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, infoMSGMock, successMSGMock, confirmMock, listMock, changePermissionMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  successMSGMock: vi.fn(),
  confirmMock: vi.fn(),
  listMock: vi.fn(),
  changePermissionMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { files: { list: listMock, changePermission: changePermissionMock } };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
  successMSG: successMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

vi.mock("../../prompt/confirm.js", () => ({
  confirmPrompt: (...args: unknown[]) => confirmMock(...args),
}));

import { filesPermissionCommand } from "./permission.js";

describe("filesPermissionCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    changePermissionMock.mockResolvedValue("ok");
    confirmMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("makes a single file public", async () => {
    await filesPermissionCommand("reports/a.pdf", "public", {});

    expect(changePermissionMock).toHaveBeenCalledWith([{ file: "reports/a.pdf", public: true }]);
  });

  test("makes a single file private", async () => {
    await filesPermissionCommand("reports/a.pdf", "private", {});

    expect(changePermissionMock).toHaveBeenCalledWith([{ file: "reports/a.pdf", public: false }]);
  });

  test("rejects an argument other than public/private", async () => {
    await expect(filesPermissionCommand("a.pdf", "open", {})).rejects.toThrow(/public|private/i);
    expect(changePermissionMock).not.toHaveBeenCalled();
  });

  test("changes a folder's files, confirming when more than one", async () => {
    listMock.mockResolvedValue({ files: [{ filename: "f/a.txt" }, { filename: "f/b.txt" }], folders: [] });

    await filesPermissionCommand("f", "public", { yes: true });

    const changed = changePermissionMock.mock.calls.flatMap((c) => c[0]);
    expect(changed.map((x: { file: string }) => x.file).sort()).toEqual(["f/a.txt", "f/b.txt"]);
    expect(changed.every((x: { public: boolean }) => x.public === true)).toBe(true);
  });

  test("prompts before a multi-file folder change and aborts on no", async () => {
    listMock.mockResolvedValue({ files: [{ filename: "f/a.txt" }, { filename: "f/b.txt" }], folders: [] });
    confirmMock.mockResolvedValue(false);

    await filesPermissionCommand("f", "private", {});

    expect(confirmMock).toHaveBeenCalled();
    expect(changePermissionMock).not.toHaveBeenCalled();
  });

  test("errors on an empty folder", async () => {
    listMock.mockResolvedValue({ files: [], folders: [] });

    await expect(filesPermissionCommand("empty", "public", { yes: true })).rejects.toThrow(/no files|not found/i);
  });

  test("fails fast when no token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesPermissionCommand("a.pdf", "public", {})).rejects.toThrow(/token/i);
  });
});
