import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResolvedScope } from "./resolve-scope.js";

const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const addOnGitIgnoreMock = vi.fn();
const resolveScopeMock = vi.fn<() => ResolvedScope>();

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
}));

vi.mock("node:crypto", () => ({
  randomBytes: (n: number) => Buffer.alloc(n, 0x61), // deterministic: "a" byte repeated
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

describe("token", () => {
  beforeEach(() => {
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    addOnGitIgnoreMock.mockReset();
    resolveScopeMock.mockReset().mockReturnValue(localScope);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readToken", () => {
    test("returns the decoded token from the last line of the lock file", async () => {
      const realToken = "real-profile-token-abc";
      const hexLine = Buffer.from(realToken).toString("hex");
      readFileSyncMock.mockReturnValue(`decoy-line-1\ndecoy-line-2\n${hexLine}`);

      const { readToken } = await import("./token.js");
      expect(readToken("prod")).toBe(realToken);
      expect(readFileSyncMock).toHaveBeenCalledWith("/repo/.tago-lock.prod.lock", { encoding: "utf-8" });
    });

    test("reads from the global scope root when scope is global", async () => {
      resolveScopeMock.mockReturnValue(globalScope);
      const realToken = "global-token-xyz";
      readFileSyncMock.mockReturnValue(Buffer.from(realToken).toString("hex"));

      const { readToken } = await import("./token.js");
      expect(readToken("prod")).toBe(realToken);
      expect(readFileSyncMock).toHaveBeenCalledWith(
        "/home/user/.config/tagoio/.tago-lock.prod.lock",
        { encoding: "utf-8" },
      );
    });

    test("returns undefined when the lock file does not exist (ENOENT)", async () => {
      readFileSyncMock.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const { readToken } = await import("./token.js");
      expect(readToken("missing")).toBeUndefined();
    });
  });

  describe("writeToken (local scope)", () => {
    test("writes 500 decoy lines + hex-encoded token and registers the lock file in .gitignore", async () => {
      const { writeToken } = await import("./token.js");
      writeToken("secret-token", "staging");

      expect(writeFileSyncMock).toHaveBeenCalledOnce();
      const [filePath, content, opts] = writeFileSyncMock.mock.calls[0];
      expect(filePath).toBe("/repo/.tago-lock.staging.lock");
      expect(opts).toEqual({ encoding: "utf-8" });

      const lines = (content as string).split("\n");
      expect(lines).toHaveLength(501);
      const decoded = Buffer.from(lines[500] as string, "hex").toString();
      expect(decoded).toBe("secret-token");

      expect(addOnGitIgnoreMock).toHaveBeenCalledWith("/repo", ".tago-lock.staging.lock");
      expect(mkdirSyncMock).not.toHaveBeenCalled();
    });
  });

  describe("writeToken (global scope) — S1 file/dir permissions", () => {
    beforeEach(() => {
      resolveScopeMock.mockReturnValue(globalScope);
    });

    test("creates the global config dir with mode 0o700 if missing", async () => {
      const { writeToken } = await import("./token.js");
      writeToken("global-secret", "prod");

      expect(mkdirSyncMock).toHaveBeenCalledOnce();
      expect(mkdirSyncMock).toHaveBeenCalledWith("/home/user/.config/tagoio", {
        recursive: true,
        mode: 0o700,
      });
    });

    test("writes the lock file with mode 0o600 (unreadable by other local users)", async () => {
      const { writeToken } = await import("./token.js");
      writeToken("global-secret", "prod");

      expect(writeFileSyncMock).toHaveBeenCalledOnce();
      const [filePath, , opts] = writeFileSyncMock.mock.calls[0];
      expect(filePath).toBe("/home/user/.config/tagoio/.tago-lock.prod.lock");
      expect(opts).toEqual({ encoding: "utf-8", mode: 0o600 });
    });

    test("does NOT write to .gitignore on global scope (not a git project)", async () => {
      const { writeToken } = await import("./token.js");
      writeToken("global-secret", "prod");

      expect(addOnGitIgnoreMock).not.toHaveBeenCalled();
    });
  });
});
