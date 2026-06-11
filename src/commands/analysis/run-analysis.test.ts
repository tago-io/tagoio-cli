import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
// Spawn mock auto-fires the registered `once("close")` handler on the next
// microtask, so runAnalysis's `await new Promise(close => …)` resolves and the
// respawn loop terminates instead of hanging the test. Set `autoCloseSpawned`
// to `false` when a test wants to drive close timing manually (e.g. to call
// onRestart before the child resolves and assert a second spawn).
let autoCloseSpawned = true;
const spawnedChildren: { kill: ReturnType<typeof vi.fn>; close: () => void }[] = [];
const spawnMock = vi.fn((_cmd: string, _opts: object) => {
  let closeFn: ((code: number) => void) | undefined;
  const child = {
    on: vi.fn(),
    once: vi.fn((event: string, fn: (code: number) => void) => {
      if (event === "close") {
        closeFn = fn;
        if (autoCloseSpawned) {
          queueMicrotask(() => fn(0));
        }
      }
    }),
    kill: vi.fn(),
    close: () => closeFn?.(0),
  };
  spawnedChildren.push(child);
  return child;
});
const installWatchShortcutsMock = vi.fn((_handlers: unknown, _options: unknown) => () => {});
const pickAnalysisFromConfigMock = vi.fn();
const detectRuntimeMock = vi.fn(() => "--node");
const accountAnalysisInfoMock = vi.fn();
const accountAnalysisEditMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return {
      analysis: {
        info: (...args: unknown[]) => accountAnalysisInfoMock(...args),
        edit: (...args: unknown[]) => accountAnalysisEditMock(...args),
      },
    };
  },
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...(args as [string, object])),
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
  resolveCLIPath: (p: string) => p,
}));

vi.mock("../../lib/current-runtime.js", () => ({
  detectRuntime: detectRuntimeMock,
}));

vi.mock("../../lib/resolve-scope.js", () => ({
  requireLocalScope: () => ({
    scope: "local" as const,
    root: "/tmp/test",
    configPath: "/tmp/test/tagoconfig.json",
    envFilePath: "/tmp/test/.tagoio/personal.env",
    configExists: true,
  }),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
  highlightMSG: (s: string) => s,
}));

vi.mock("../../lib/search-name.js", () => ({
  searchName: vi.fn((_name: string, list: { value: unknown }[]) => list[0]?.value),
}));

vi.mock("../../prompt/pick-analysis-from-config.js", () => ({
  pickAnalysisFromConfig: (...args: unknown[]) => pickAnalysisFromConfigMock(...args),
}));

vi.mock("../../lib/watch-shortcuts.js", () => ({
  installWatchShortcuts: (...args: unknown[]) => installWatchShortcutsMock(...(args as [unknown, unknown])),
}));

describe("buildCMD", () => {
  let _buildCMD: (options: { tsnd: boolean; debug: boolean; clear: boolean }, runtime: string) => string;
  beforeEach(async () => {
    ({ _buildCMD } = await import("./run-analysis.js"));
  });

  it("should return the correct command when tsnd is false and debug and clear are false", () => {
    const options = { tsnd: false, debug: false, clear: false };
    const result = _buildCMD(options, "--node");
    expect(result).toContain("node");
    expect(result).toContain("tsx/dist/cli.mjs");
    expect(result).toContain("watch ");
    expect(result).not.toContain("--inspect");
    expect(result).not.toContain("--clear");
    expect(result).not.toContain("tsnd");
  });

  it("should return the correct command when tsnd is true and debug and clear are false", () => {
    const options = { tsnd: true, debug: false, clear: false };
    const result = _buildCMD(options, "--node");
    expect(result).toBe("tsnd ");
  });

  it("should return the correct command when tsnd is true and debug is true and clear is false", () => {
    const options = { tsnd: true, debug: true, clear: false };
    const result = _buildCMD(options, "--node");
    expect(result).toBe("tsnd --inspect -- ");
  });

  it("should return the correct command when tsnd is true and debug is false and clear is true", () => {
    const options = { tsnd: true, debug: false, clear: true };
    const result = _buildCMD(options, "--node");
    expect(result).toBe("tsnd --clear ");
  });

  it("should return the correct command when tsnd is false and debug is true and clear is false", () => {
    const options = { tsnd: false, debug: true, clear: false };
    const result = _buildCMD(options, "--node");
    expect(result).toContain("node");
    expect(result).toContain("tsx/dist/cli.mjs");
    expect(result).toContain("watch ");
    expect(result).toContain("--inspect");
    expect(result).not.toContain("--clear");
    expect(result).not.toContain("tsnd");
  });

  it("should return the correct command when tsnd is false and debug is false and clear is true", () => {
    const options = { tsnd: false, debug: false, clear: true };
    const result = _buildCMD(options, "--node");
    expect(result).toContain("node");
    expect(result).toContain("tsx/dist/cli.mjs");
    expect(result).toContain("watch ");
    expect(result).toContain("--clear");
    expect(result).not.toContain("--inspect");
    expect(result).not.toContain("tsnd");
  });

  it("should return the correct command when using deno and debug is false", () => {
    const options = { tsnd: false, debug: false, clear: false };
    const result = _buildCMD(options, "--deno");
    expect(result).toContain("deno");
    expect(result).toContain("--watch");
    expect(result).toContain("--allow-all");
    expect(result).not.toContain("--inspect");
    expect(result).not.toContain("--clear");
  });

  it("should return the correct command when using deno and debug is true", () => {
    const options = { tsnd: false, debug: true, clear: false };
    const result = _buildCMD(options, "--deno");
    expect(result).toContain("deno");
    expect(result).toContain("--watch");
    expect(result).toContain("--allow-all");
    expect(result).toContain("--inspect");
    expect(result).not.toContain("--clear");
  });
});

describe("runAnalysis", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnedChildren.length = 0;
    autoCloseSpawned = true;
    installWatchShortcutsMock.mockImplementation((_h, _o) => () => {});
    accountAnalysisEditMock.mockResolvedValue(undefined);
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalIsTTY });
  });

  test("errors out when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue({ profileToken: "" });
    const { runAnalysis } = await import("./run-analysis.js");
    await expect(
      runAnalysis("my-script", {
        environment: "prod",
        debug: false,
        clear: false,
        tsnd: false,
        deno: false,
        node: false,
      }),
    ).rejects.toThrow(/Environment not found/);
  });

  test("errors out when analysis cannot be found", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [],
      analysisPath: "/tmp",
    });
    const { runAnalysis } = await import("./run-analysis.js");
    await expect(
      runAnalysis("missing", {
        environment: "prod",
        debug: false,
        clear: false,
        tsnd: false,
        deno: false,
        node: false,
      }),
    ).rejects.toThrow(/Analysis couldn't be found/);
  });

  test("errors out when both --deno and --node are passed", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValue({
      token: "at",
      run_on: "external",
      name: "A",
      runtime: "node",
    });
    const { runAnalysis } = await import("./run-analysis.js");
    await expect(
      runAnalysis("A", {
        environment: "prod",
        debug: false,
        clear: false,
        tsnd: false,
        deno: true,
        node: true,
      }),
    ).rejects.toThrow(/Cannot specify both/);
  });

  test("spawns the analysis when run_on is external", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValue({
      token: "at",
      run_on: "external",
      name: "A",
      runtime: "node",
    });

    const { runAnalysis } = await import("./run-analysis.js");
    await runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: true,
    });
    expect(spawnMock).toHaveBeenCalled();
  });

  test("switches run_on from tago to external and spawns", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: { api: "https://api.x", sse: "https://sse.x" },
      analysisList: [{ id: "a1", name: "A", fileName: "a.js", path: "sub" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValueOnce({
      token: "at",
      run_on: "tago",
      name: "A",
      runtime: "node",
    });
    accountAnalysisInfoMock.mockResolvedValueOnce({
      token: "at2",
      run_on: "external",
      name: "A",
    });

    vi.useFakeTimers();
    const { runAnalysis } = await import("./run-analysis.js");
    const promise = runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: false,
    });
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();
    expect(accountAnalysisEditMock).toHaveBeenCalledWith("a1", { run_on: "external" });
    expect(spawnMock).toHaveBeenCalled();
  });

  test("prompts for analysis when scriptName is not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    pickAnalysisFromConfigMock.mockResolvedValue({ id: "a1", name: "A", fileName: "a.js" });
    accountAnalysisInfoMock.mockResolvedValue({
      token: "at",
      run_on: "external",
      name: "A",
      runtime: "node",
    });

    const { runAnalysis } = await import("./run-analysis.js");
    await runAnalysis(undefined, {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: false,
    });
    expect(pickAnalysisFromConfigMock).toHaveBeenCalled();
  });

  test("pressing onRestart kills the current child and respawns with the same command", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    autoCloseSpawned = false;
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValue({ token: "at", run_on: "external", name: "A", runtime: "node" });

    let capturedHandlers: { onRestart: () => void; onQuit: () => void } | undefined;
    installWatchShortcutsMock.mockImplementation((handlers: unknown) => {
      capturedHandlers = handlers as { onRestart: () => void; onQuit: () => void };
      return () => {};
    });

    const { runAnalysis } = await import("./run-analysis.js");
    const promise = runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: true,
      interactive: true,
    } as never);

    // Yield to let runAnalysis register the close handler on child #1.
    await new Promise((r) => setImmediate(r));
    expect(spawnedChildren).toHaveLength(1);

    capturedHandlers?.onRestart();
    spawnedChildren[0].close();

    // Yield to let the loop spawn child #2.
    await new Promise((r) => setImmediate(r));
    expect(spawnedChildren).toHaveLength(2);
    expect(spawnedChildren[0].kill).toHaveBeenCalledWith("SIGTERM");

    // Quit to terminate the loop.
    capturedHandlers?.onQuit();
    spawnedChildren[1].close();
    await promise;

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0][0]).toEqual(spawnMock.mock.calls[1][0]);
  });

  test("pressing onQuit exits the loop and flips run_on back to tago exactly once", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    autoCloseSpawned = false;
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValue({ token: "at", run_on: "external", name: "A", runtime: "node" });

    let capturedHandlers: { onQuit: () => void } | undefined;
    installWatchShortcutsMock.mockImplementation((handlers: unknown) => {
      capturedHandlers = handlers as { onQuit: () => void };
      return () => {};
    });

    const { runAnalysis } = await import("./run-analysis.js");
    const promise = runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: true,
      interactive: true,
    } as never);

    await new Promise((r) => setImmediate(r));
    capturedHandlers?.onQuit();
    spawnedChildren[0].close();
    await promise;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnedChildren[0].kill).toHaveBeenCalledWith("SIGTERM");
    expect(accountAnalysisEditMock).toHaveBeenCalledWith("a1", { run_on: "tago" });
    const tagoFlips = accountAnalysisEditMock.mock.calls.filter((c) => c[1]?.run_on === "tago");
    expect(tagoFlips).toHaveLength(1);
  });

  test("--no-interactive disables shortcuts (installWatchShortcuts called with enabled: false)", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValue({ token: "at", run_on: "external", name: "A", runtime: "node" });

    const { runAnalysis } = await import("./run-analysis.js");
    await runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: true,
      interactive: false,
    } as never);

    expect(installWatchShortcutsMock).toHaveBeenCalledTimes(1);
    const opts = installWatchShortcutsMock.mock.calls[0][1] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  test("quotes the script path so a path containing spaces stays a single shell argument", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/Users/maria/My Project",
    });
    accountAnalysisInfoMock.mockResolvedValue({ token: "at", run_on: "external", name: "A", runtime: "node" });

    const { runAnalysis } = await import("./run-analysis.js");
    await runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: true,
    });

    const command = spawnMock.mock.calls[0][0];
    // The whole path, spaces included, must sit inside one pair of quotes —
    // otherwise the shell would split "/Users/maria/My Project/a.js" into two
    // arguments and the runtime would fail to find the file.
    expect(command).toContain('"/Users/maria/My Project/a.js"');
  });

  test("non-TTY stdin disables shortcuts even when --no-interactive is absent", async () => {
    // beforeEach already sets isTTY = false; this is the explicit case.
    getEnvironmentConfigMock.mockReturnValue({
      profileToken: "tok",
      profileRegion: "usa-1",
      analysisList: [{ id: "a1", name: "A", fileName: "a.js" }],
      analysisPath: "/tmp",
    });
    accountAnalysisInfoMock.mockResolvedValue({ token: "at", run_on: "external", name: "A", runtime: "node" });

    const { runAnalysis } = await import("./run-analysis.js");
    await runAnalysis("A", {
      environment: "prod",
      debug: false,
      clear: false,
      tsnd: false,
      deno: false,
      node: true,
    });

    const opts = installWatchShortcutsMock.mock.calls[0][1] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });
});
