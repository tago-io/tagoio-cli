import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResolvedScope } from "./resolve-scope.js";

const existsSyncMock = vi.fn<(path: string) => boolean>();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("node:os", () => ({
  default: { homedir: () => "/home/user" },
  homedir: () => "/home/user",
}));

const SENTINEL_PATH = "/home/user/.tagoio/.scope-notice-shown";

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

describe("scope-notice", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("maybeShowScopeNotice", () => {
    test("emits the local-profile notice and writes the sentinel on first call", async () => {
      existsSyncMock.mockReturnValue(false);

      const { maybeShowScopeNotice } = await import("./scope-notice.js");
      maybeShowScopeNotice(localScope);

      expect(stderrSpy).toHaveBeenCalledOnce();
      const written = stderrSpy.mock.calls[0][0] as string;
      expect(written).toContain("[INFO]");
      expect(written).toContain("global and local profiles");
      expect(written).toContain("local profile");
      expect(written).toContain("This message will not appear again");

      expect(mkdirSyncMock).toHaveBeenCalledWith("/home/user/.tagoio", { recursive: true });
      expect(writeFileSyncMock).toHaveBeenCalledWith(SENTINEL_PATH, "");
    });

    test("no-ops when the sentinel already exists (subsequent runs silent)", async () => {
      existsSyncMock.mockImplementation((p: string) => p === SENTINEL_PATH);

      const { maybeShowScopeNotice } = await import("./scope-notice.js");
      maybeShowScopeNotice(localScope);

      expect(stderrSpy).not.toHaveBeenCalled();
      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    test("does not emit on global scope (fresh user → init guides them)", async () => {
      existsSyncMock.mockReturnValue(false);

      const { maybeShowScopeNotice } = await import("./scope-notice.js");
      maybeShowScopeNotice(globalScope);

      expect(stderrSpy).not.toHaveBeenCalled();
      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    test("never throws if the sentinel write fails (read-only $HOME)", async () => {
      existsSyncMock.mockReturnValue(false);
      writeFileSyncMock.mockImplementation(() => {
        throw new Error("EROFS: read-only filesystem");
      });

      const { maybeShowScopeNotice } = await import("./scope-notice.js");
      expect(() => maybeShowScopeNotice(localScope)).not.toThrow();

      // Notice still emitted even though sentinel write failed.
      expect(stderrSpy).toHaveBeenCalledOnce();
    });
  });

  describe("printScopeBanner", () => {
    test("writes [INFO] Using local profile (<path>) to stderr", async () => {
      const { printScopeBanner } = await import("./scope-notice.js");
      printScopeBanner(localScope);

      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stderrSpy.mock.calls[0][0]).toBe("[INFO] Using local profile (/repo/tagoconfig.json)\n");
    });

    test("writes [INFO] Using global profile (<path>) to stderr", async () => {
      const { printScopeBanner } = await import("./scope-notice.js");
      printScopeBanner(globalScope);

      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stderrSpy.mock.calls[0][0]).toBe(
        "[INFO] Using global profile (/home/user/.config/tagoio/tagoconfig.json)\n",
      );
    });

    test("suppresses the banner under --silent", async () => {
      const { printScopeBanner } = await import("./scope-notice.js");
      printScopeBanner(localScope, true);

      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
