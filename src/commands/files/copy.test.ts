import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, infoMSGMock, successMSGMock, listMock, copyMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  successMSGMock: vi.fn(),
  listMock: vi.fn(),
  copyMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { files: { list: listMock, copy: copyMock } };
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

import { filesCopyCommand } from "./copy.js";

describe("filesCopyCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    copyMock.mockResolvedValue("ok");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("copies a single file with one copy call", async () => {
    await filesCopyCommand("reports/a.pdf", "backups/a.pdf", {});

    expect(copyMock).toHaveBeenCalledWith([{ from: "reports/a.pdf", to: "backups/a.pdf" }]);
    expect(listMock).not.toHaveBeenCalled();
  });

  test("copies a folder, remapping each file's prefix", async () => {
    listMock.mockResolvedValue({
      files: [{ filename: "custom-widgets/lc/index.html" }, { filename: "custom-widgets/lc/app.js" }],
      folders: [],
    });

    await filesCopyCommand("custom-widgets/lc", "backups/lc", {});

    const copied = copyMock.mock.calls.map((c) => c[0][0]);
    expect(copied).toEqual([
      { from: "custom-widgets/lc/index.html", to: "backups/lc/index.html" },
      { from: "custom-widgets/lc/app.js", to: "backups/lc/app.js" },
    ]);
  });

  test("errors on an empty folder (nothing to copy)", async () => {
    listMock.mockResolvedValue({ files: [], folders: [] });

    await expect(filesCopyCommand("empty", "dest", {})).rejects.toThrow(/no files|not found/i);
  });

  test("fails fast when no token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesCopyCommand("a.txt", "b.txt", {})).rejects.toThrow(/token/i);
  });
});
