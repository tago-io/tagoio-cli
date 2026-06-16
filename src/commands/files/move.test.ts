import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, infoMSGMock, successMSGMock, confirmMock, listMock, moveMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  successMSGMock: vi.fn(),
  confirmMock: vi.fn(),
  listMock: vi.fn(),
  moveMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { files: { list: listMock, move: moveMock } };
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

import { filesMoveCommand } from "./move.js";

describe("filesMoveCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    moveMock.mockResolvedValue("ok");
    confirmMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("moves a single file with one move call", async () => {
    await filesMoveCommand("reports/a.pdf", "backups/a.pdf", {});

    expect(moveMock).toHaveBeenCalledTimes(1);
    expect(moveMock).toHaveBeenCalledWith([{ from: "reports/a.pdf", to: "backups/a.pdf" }]);
    expect(listMock).not.toHaveBeenCalled();
  });

  test("moves a folder, remapping each file's prefix", async () => {
    listMock.mockResolvedValue({
      files: [{ filename: "custom-widgets/lc/index.html" }, { filename: "custom-widgets/lc/app.js" }],
      folders: [],
    });

    await filesMoveCommand("custom-widgets/lc", "backups/lc", { yes: true });

    const moved = moveMock.mock.calls.map((c) => c[0][0]);
    expect(moved).toEqual([
      { from: "custom-widgets/lc/index.html", to: "backups/lc/index.html" },
      { from: "custom-widgets/lc/app.js", to: "backups/lc/app.js" },
    ]);
  });

  test("prompts before a multi-file folder move and aborts on no", async () => {
    listMock.mockResolvedValue({
      files: [{ filename: "f/a.txt" }, { filename: "f/b.txt" }],
      folders: [],
    });
    confirmMock.mockResolvedValue(false);

    await filesMoveCommand("f", "g", {});

    expect(confirmMock).toHaveBeenCalled();
    expect(moveMock).not.toHaveBeenCalled();
  });

  test("--yes skips the folder confirmation", async () => {
    listMock.mockResolvedValue({ files: [{ filename: "f/a.txt" }, { filename: "f/b.txt" }], folders: [] });

    await filesMoveCommand("f", "g", { yes: true });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(moveMock).toHaveBeenCalledTimes(2);
  });

  test("errors on an empty folder (nothing to move)", async () => {
    listMock.mockResolvedValue({ files: [], folders: [] });

    await expect(filesMoveCommand("empty", "dest", { yes: true })).rejects.toThrow(/no files|not found/i);
  });

  test("fails fast when no token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesMoveCommand("a.txt", "b.txt", {})).rejects.toThrow(/token/i);
  });
});
