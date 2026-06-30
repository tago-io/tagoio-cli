import { beforeEach, describe, expect, it, test, vi } from "vitest";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const spawnMock = vi.fn(() => ({
  on: vi.fn(),
}));
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
  spawn: (...args: unknown[]) => spawnMock(...(args as [])),
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
  highlightMSG: (s: string) => s,
}));

vi.mock("../../lib/search-name.js", () => ({
  searchName: vi.fn((_name: string, list: { value: unknown }[]) => list[0]?.value),
}));

vi.mock("../../prompt/pick-analysis-from-config.js", () => ({
  pickAnalysisFromConfig: (...args: unknown[]) => pickAnalysisFromConfigMock(...args),
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
  beforeEach(() => {
    vi.clearAllMocks();
    accountAnalysisEditMock.mockResolvedValue(undefined);
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
});
