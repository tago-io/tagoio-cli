import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const addOnGitIgnoreMock = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("./get-current-folder.js", () => ({
  getCurrentFolder: () => "/repo",
}));

vi.mock("./add-to-gitignore.js", () => ({
  addOnGitIgnore: addOnGitIgnoreMock,
}));

describe("dotenv-config", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    addOnGitIgnoreMock.mockReset();
    delete process.env.TAGOIO_DEFAULT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureDirectoryExistence", () => {
    test("no-ops when the parent directory already exists", async () => {
      existsSyncMock.mockReturnValue(true);

      const { ensureDirectoryExistence } = await import("./dotenv-config.js");
      ensureDirectoryExistence("/repo/.tagoio/personal.env");

      expect(mkdirSyncMock).not.toHaveBeenCalled();
    });

    test("creates the chain of missing parent directories (deepest first)", async () => {
      // /a exists; /a/b and /a/b/c do not. `ensureDirectoryExistence("/a/b/c/file")`
      // should create /a/b then /a/b/c.
      existsSyncMock.mockImplementation((p: string) => p === "/a");

      const { ensureDirectoryExistence } = await import("./dotenv-config.js");
      ensureDirectoryExistence("/a/b/c/file");

      expect(mkdirSyncMock).toHaveBeenCalledTimes(2);
      expect(mkdirSyncMock.mock.calls[0][0]).toBe("/a/b");
      expect(mkdirSyncMock.mock.calls[1][0]).toBe("/a/b/c");
    });
  });

  describe("setEnvironmentVariables", () => {
    test("writes the TAGOIO_DEFAULT value to the env file and registers .tagoio in .gitignore", async () => {
      existsSyncMock.mockReturnValue(true);

      const { setEnvironmentVariables } = await import("./dotenv-config.js");
      setEnvironmentVariables({ TAGOIO_DEFAULT: "production" });

      expect(writeFileSyncMock).toHaveBeenCalledOnce();
      const [, content] = writeFileSyncMock.mock.calls[0];
      expect(content).toContain("TAGOIO_DEFAULT=production");
      expect(addOnGitIgnoreMock).toHaveBeenCalledWith("/repo", ".tagoio");
    });

    test("falls back to process.env.TAGOIO_DEFAULT when the param is empty", async () => {
      existsSyncMock.mockReturnValue(true);
      process.env.TAGOIO_DEFAULT = "staging";

      const { setEnvironmentVariables } = await import("./dotenv-config.js");
      setEnvironmentVariables({ TAGOIO_DEFAULT: "" });

      const [, content] = writeFileSyncMock.mock.calls[0];
      expect(content).toContain("TAGOIO_DEFAULT=staging");
    });
  });
});
