import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const addOnGitIgnoreMock = vi.fn();
const getCurrentFolderMock = vi.fn();

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("node:crypto", () => ({
  randomBytes: (n: number) => Buffer.alloc(n, 0x61), // deterministic: "a" byte repeated
}));

vi.mock("./get-current-folder.js", () => ({
  getCurrentFolder: () => getCurrentFolderMock(),
}));

vi.mock("./add-to-gitignore.js", () => ({
  addOnGitIgnore: addOnGitIgnoreMock,
}));

describe("token", () => {
  beforeEach(() => {
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    addOnGitIgnoreMock.mockReset();
    getCurrentFolderMock.mockReset().mockReturnValue("/repo");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readToken", () => {
    test("returns the decoded token from the last line of the lock file", async () => {
      // File is: 500 decoy hex lines + final line = hex-encoded real token
      const realToken = "real-profile-token-abc";
      const hexLine = Buffer.from(realToken).toString("hex");
      readFileSyncMock.mockReturnValue(`decoy-line-1\ndecoy-line-2\n${hexLine}`);

      const { readToken } = await import("./token.js");
      expect(readToken("prod")).toBe(realToken);
      expect(readFileSyncMock).toHaveBeenCalledWith("/repo/.tago-lock.prod.lock", { encoding: "utf-8" });
    });

    test("returns undefined when the lock file does not exist (ENOENT)", async () => {
      readFileSyncMock.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const { readToken } = await import("./token.js");
      expect(readToken("missing")).toBeUndefined();
    });
  });

  describe("writeToken", () => {
    test("writes 500 decoy lines + hex-encoded token and registers the lock file in .gitignore", async () => {
      const { writeToken } = await import("./token.js");
      writeToken("secret-token", "staging");

      expect(writeFileSyncMock).toHaveBeenCalledOnce();
      const [path, content, opts] = writeFileSyncMock.mock.calls[0];
      expect(path).toBe("/repo/.tago-lock.staging.lock");
      expect(opts).toEqual({ encoding: "utf-8" });

      const lines = (content as string).split("\n");
      // 500 decoys + 1 token line (no trailing newline before token) → 501 entries
      expect(lines).toHaveLength(501);
      const decoded = Buffer.from(lines[500] as string, "hex").toString();
      expect(decoded).toBe("secret-token");

      expect(addOnGitIgnoreMock).toHaveBeenCalledWith("/repo", ".tago-lock.staging.lock");
    });

    test("returns silently without writing when getCurrentFolder yields an empty path", async () => {
      getCurrentFolderMock.mockReturnValue("");

      const { writeToken } = await import("./token.js");
      writeToken("secret-token", "staging");

      expect(writeFileSyncMock).not.toHaveBeenCalled();
      expect(addOnGitIgnoreMock).not.toHaveBeenCalled();
    });
  });
});
