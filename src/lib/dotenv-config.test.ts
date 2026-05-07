import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResolvedScope } from "./resolve-scope.js";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const addOnGitIgnoreMock = vi.fn();
const resolveScopeMock = vi.fn<() => ResolvedScope>();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("./resolve-scope.js", () => ({
  resolveScope: () => resolveScopeMock(),
}));

vi.mock("./add-to-gitignore.js", () => ({
  addOnGitIgnore: addOnGitIgnoreMock,
}));

const localScope: ResolvedScope = {
  scope: "local",
  root: "/repo",
  configPath: "/repo/tagoconfig.json",
  envFilePath: "/repo/.tagoio/personal.env",
  configExists: true,
};

const globalScope: ResolvedScope = {
  scope: "global",
  root: "/home/user/.config/tagoio",
  configPath: "/home/user/.config/tagoio/tagoconfig.json",
  envFilePath: "/home/user/.config/tagoio/.tagoio/personal.env",
  configExists: true,
};

describe("dotenv-config", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    addOnGitIgnoreMock.mockReset();
    resolveScopeMock.mockReset().mockReturnValue(localScope);
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
      existsSyncMock.mockImplementation((p: string) => p === "/a");

      const { ensureDirectoryExistence } = await import("./dotenv-config.js");
      ensureDirectoryExistence("/a/b/c/file");

      expect(mkdirSyncMock).toHaveBeenCalledTimes(2);
      expect(mkdirSyncMock.mock.calls[0][0]).toBe("/a/b");
      expect(mkdirSyncMock.mock.calls[1][0]).toBe("/a/b/c");
    });
  });

  describe("setEnvironmentVariables (local scope)", () => {
    test("writes TAGOIO_DEFAULT to the resolved envFilePath and registers .tagoio in .gitignore", async () => {
      existsSyncMock.mockReturnValue(true);

      const { setEnvironmentVariables } = await import("./dotenv-config.js");
      setEnvironmentVariables({ TAGOIO_DEFAULT: "production" });

      expect(writeFileSyncMock).toHaveBeenCalledOnce();
      const [filePath, content] = writeFileSyncMock.mock.calls[0];
      expect(filePath).toBe("/repo/.tagoio/personal.env");
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

  describe("setEnvironmentVariables (global scope)", () => {
    beforeEach(() => {
      resolveScopeMock.mockReturnValue(globalScope);
      existsSyncMock.mockReturnValue(true);
    });

    test("writes to the global scope's envFilePath", async () => {
      const { setEnvironmentVariables } = await import("./dotenv-config.js");
      setEnvironmentVariables({ TAGOIO_DEFAULT: "prod" });

      const [filePath] = writeFileSyncMock.mock.calls[0];
      expect(filePath).toBe("/home/user/.config/tagoio/.tagoio/personal.env");
    });

    test("does NOT add to .gitignore on global scope (not a git project)", async () => {
      const { setEnvironmentVariables } = await import("./dotenv-config.js");
      setEnvironmentVariables({ TAGOIO_DEFAULT: "prod" });

      expect(addOnGitIgnoreMock).not.toHaveBeenCalled();
    });
  });

  describe("getEnvFilePath", () => {
    test("returns the resolved scope's envFilePath at call time", async () => {
      const { getEnvFilePath } = await import("./dotenv-config.js");
      expect(getEnvFilePath()).toBe("/repo/.tagoio/personal.env");

      resolveScopeMock.mockReturnValue(globalScope);
      expect(getEnvFilePath()).toBe("/home/user/.config/tagoio/.tagoio/personal.env");
    });
  });
});
