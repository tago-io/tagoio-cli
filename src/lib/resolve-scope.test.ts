import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const existsSyncMock = vi.fn<(path: string) => boolean>();
const lstatSyncMock = vi.fn();
const errorHandlerMock = vi.fn<(str: unknown) => never>(() => {
  throw new Error("errorHandler called");
});

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  lstatSync: lstatSyncMock,
}));

vi.mock("node:os", () => ({
  default: { homedir: () => "/home/user" },
  homedir: () => "/home/user",
}));

vi.mock("./messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

/** Helper: declare which absolute paths "exist" for a given test. */
function setExisting(paths: string[]) {
  const set = new Set(paths);
  existsSyncMock.mockImplementation((p: string) => set.has(p));
}

describe("resolve-scope", () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    existsSyncMock.mockReset();
    lstatSyncMock.mockReset().mockReturnValue({ isSymbolicLink: () => false });
    errorHandlerMock.mockClear();
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.APPDATA;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    // Defensive: clear any module-level scope override left by a prior test.
    const { setScopeOverride } = await import("./resolve-scope.js");
    setScopeOverride(undefined);
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("globalConfigDir", () => {
    test("uses XDG_CONFIG_HOME when set on Linux/macOS", async () => {
      process.env.XDG_CONFIG_HOME = "/custom/xdg";
      const { globalConfigDir } = await import("./resolve-scope.js");
      expect(globalConfigDir()).toBe("/custom/xdg/tagoio");
    });

    test("falls back to ~/.config on Linux/macOS when XDG_CONFIG_HOME is unset", async () => {
      const { globalConfigDir } = await import("./resolve-scope.js");
      expect(globalConfigDir()).toBe("/home/user/.config/tagoio");
    });

    test("uses APPDATA on Windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      process.env.APPDATA = "C:\\Users\\u\\AppData\\Roaming";
      const { globalConfigDir } = await import("./resolve-scope.js");
      // path.join on a Linux test runner normalizes backslashes; just assert it
      // ends with the tagoio segment under the supplied APPDATA root.
      expect(globalConfigDir()).toContain("tagoio");
      expect(globalConfigDir()).toContain("Roaming");
    });
  });

  describe("resolveScope", () => {
    test("returns local when startDir directly contains tagoconfig.json", async () => {
      setExisting(["/repo/tagoconfig.json"]);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: "/repo" });
      expect(scope).toEqual({
        scope: "local",
        root: "/repo",
        configPath: "/repo/tagoconfig.json",
        envFilePath: "/repo/.tagoio/personal.env",
        configExists: true,
      });
    });

    test("walks up the parent chain until it finds tagoconfig.json", async () => {
      setExisting(["/repo/tagoconfig.json"]);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: "/repo/deep/nested/path" });
      expect(scope.scope).toBe("local");
      expect(scope.root).toBe("/repo");
    });

    test("local wins over global when both exist", async () => {
      setExisting([
        "/repo/tagoconfig.json",
        "/home/user/.config/tagoio",
        "/home/user/.config/tagoio/tagoconfig.json",
      ]);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: "/repo/sub" });
      expect(scope.scope).toBe("local");
      expect(scope.root).toBe("/repo");
    });

    test("falls back to global scope when no ancestor contains tagoconfig.json", async () => {
      setExisting([]);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: "/tmp/random" });
      expect(scope.scope).toBe("global");
      expect(scope.root).toBe("/home/user/.config/tagoio");
      expect(scope.configExists).toBe(false);
    });

    test("global configExists reflects whether the global tagoconfig.json is on disk", async () => {
      setExisting(["/home/user/.config/tagoio/tagoconfig.json"]);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: "/tmp/random" });
      expect(scope.scope).toBe("global");
      expect(scope.configExists).toBe(true);
    });

    test("caps the parent walk at 32 levels to bound stat calls on slow filesystems", async () => {
      // No tagoconfig.json anywhere; track existsSync hits to confirm cap.
      const calls: string[] = [];
      existsSyncMock.mockImplementation((p: string) => {
        calls.push(p);
        return false;
      });

      // Build a 60-level deep startDir.
      const deepStart = "/a" + "/b".repeat(60);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: deepStart });
      expect(scope.scope).toBe("global");

      // Each iteration calls existsSync once for tagoconfig.json check;
      // the final fallback to global also calls existsSync twice (dir + config).
      // The walk itself must stop at 32 iterations max.
      const walkChecks = calls.filter((c) => c.endsWith("/tagoconfig.json") && !c.includes(".config"));
      expect(walkChecks.length).toBeLessThanOrEqual(32);
    });

    test("uses logical parent (path.dirname) — does not resolve symlinks in the cwd chain", async () => {
      // Layout: /symlinked-cwd is a symlink to /real/place; tagoconfig.json
      // sits at /symlinked-cwd's parent. A logical walk finds it; a realpath
      // walk would never reach it.
      setExisting(["/parent/tagoconfig.json"]);
      const { resolveScope } = await import("./resolve-scope.js");
      const scope = resolveScope({ startDir: "/parent/symlinked-cwd" });
      expect(scope.scope).toBe("local");
      expect(scope.root).toBe("/parent");
    });

    test("refuses to operate when the global config dir is a symlink (S2)", async () => {
      setExisting(["/home/user/.config/tagoio"]);
      lstatSyncMock.mockReturnValue({ isSymbolicLink: () => true });

      const { resolveScope } = await import("./resolve-scope.js");
      expect(() => resolveScope({ startDir: "/tmp/random" })).toThrow();
      expect(errorHandlerMock).toHaveBeenCalledOnce();
      expect(errorHandlerMock.mock.calls[0][0]).toContain("symlink");
    });

    test("does NOT call lstatSync when global dir doesn't exist (fresh user)", async () => {
      setExisting([]);
      const { resolveScope } = await import("./resolve-scope.js");
      resolveScope({ startDir: "/tmp/random" });
      expect(lstatSyncMock).not.toHaveBeenCalled();
    });
  });

  describe("setScopeOverride", () => {
    test("forces resolveScope to return global, bypassing the walk", async () => {
      // Set up a fixture where resolveScope WOULD return local without the override.
      setExisting(["/repo/tagoconfig.json"]);

      const { resolveScope, setScopeOverride } = await import("./resolve-scope.js");

      // Sanity: without override, returns local.
      const baseline = resolveScope({ startDir: "/repo/sub" });
      expect(baseline.scope).toBe("local");

      // With override, returns global regardless of cwd.
      setScopeOverride("global");
      const overridden = resolveScope({ startDir: "/repo/sub" });
      expect(overridden.scope).toBe("global");
      expect(overridden.root).toBe("/home/user/.config/tagoio");

      // Reset for next test.
      setScopeOverride(undefined);
    });

    test("clearing the override (undefined) returns to walk-based resolution", async () => {
      setExisting(["/repo/tagoconfig.json"]);

      const { resolveScope, setScopeOverride } = await import("./resolve-scope.js");
      setScopeOverride("global");
      expect(resolveScope({ startDir: "/repo" }).scope).toBe("global");

      setScopeOverride(undefined);
      expect(resolveScope({ startDir: "/repo" }).scope).toBe("local");
    });
  });

  describe("requireLocalScope", () => {
    test("returns the resolved scope when scope is local", async () => {
      setExisting(["/repo/tagoconfig.json"]);
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");

      const { requireLocalScope } = await import("./resolve-scope.js");
      const scope = requireLocalScope("analysis-deploy");
      expect(scope.scope).toBe("local");
      expect(scope.root).toBe("/repo");

      cwdSpy.mockRestore();
    });

    test("errors actionably when scope is global, naming the command", async () => {
      setExisting([]);
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/random");

      const { requireLocalScope } = await import("./resolve-scope.js");
      expect(() => requireLocalScope("analysis-deploy")).toThrow();
      const message = errorHandlerMock.mock.calls[0][0] as string;
      expect(message).toContain("analysis-deploy");
      expect(message).toContain("project directory");
      expect(message).toContain("tagoio init");

      cwdSpy.mockRestore();
    });
  });
});
