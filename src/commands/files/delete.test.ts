import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, infoMSGMock, successMSGMock, confirmMock, listMock, deleteMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  successMSGMock: vi.fn(),
  confirmMock: vi.fn(),
  listMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { files: { list: listMock, delete: deleteMock } };
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

import { filesDeleteCommand } from "./delete.js";

describe("filesDeleteCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deleteMock.mockResolvedValue("ok");
    confirmMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("deletes a single file after confirmation", async () => {
    await filesDeleteCommand("reports/a.pdf", {});

    expect(confirmMock).toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith(["reports/a.pdf"]);
  });

  test("aborts when the user declines", async () => {
    confirmMock.mockResolvedValue(false);

    await filesDeleteCommand("reports/a.pdf", {});

    expect(deleteMock).not.toHaveBeenCalled();
  });

  test("--yes skips the confirmation", async () => {
    await filesDeleteCommand("reports/a.pdf", { yes: true });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith(["reports/a.pdf"]);
  });

  test("deletes every file under a folder prefix", async () => {
    listMock.mockResolvedValue({
      files: [{ filename: "f/a.txt" }, { filename: "f/b.txt" }],
      folders: [],
    });

    await filesDeleteCommand("f", { yes: true });

    const deleted = deleteMock.mock.calls.flatMap((c) => c[0]);
    expect(deleted.sort()).toEqual(["f/a.txt", "f/b.txt"]);
  });

  test("deletes in multiple batches for large folders", async () => {
    const files = Array.from({ length: 120 }, (_, i) => ({ filename: `f/file-${i}.txt` }));
    listMock.mockResolvedValue({ files, folders: [] });

    await filesDeleteCommand("f", { yes: true });

    // 120 files / batch size 50 => 3 delete calls.
    expect(deleteMock).toHaveBeenCalledTimes(3);
    const total = deleteMock.mock.calls.flatMap((c) => c[0]).length;
    expect(total).toBe(120);
  });

  test("no-op with a clear message when nothing matches", async () => {
    listMock.mockResolvedValue({ files: [], folders: [] });

    await filesDeleteCommand("empty", { yes: true });

    expect(deleteMock).not.toHaveBeenCalled();
    expect(infoMSGMock).toHaveBeenCalled();
  });

  test("fails fast when no token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesDeleteCommand("a.txt", {})).rejects.toThrow(/token/i);
  });
});
