import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn<(str: unknown) => never>(() => {
  throw new Error("errorHandler called");
});
const detectInitStateMock = vi.fn();
const exitMock = vi.fn(() => {
  throw new Error("process.exit called");
});

vi.mock("../lib/config-file.js", () => ({
  getConfigFile: vi.fn(),
  writeConfigFileEnv: vi.fn(),
  writeToConfigFile: vi.fn(),
}));

vi.mock("../lib/token.js", () => ({
  readToken: vi.fn(),
  writeToken: vi.fn(),
}));

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  highlightMSG: (s: string) => s,
  infoMSG: vi.fn(),
}));

vi.mock("../lib/resolve-scope.js", () => ({
  resolveScope: () => ({
    scope: "local" as const,
    root: "/repo",
    configPath: "/repo/tagoconfig.json",
    envFilePath: "/repo/.tagoio/personal.env",
    configExists: true,
  }),
  setScopeOverride: vi.fn(),
  globalConfigDir: () => "/home/user/.config/tagoio",
}));

vi.mock("../lib/init-state.js", () => ({
  detectInitState: (envName: string) => detectInitStateMock(envName),
}));

vi.mock("../lib/init-summary.js", () => ({
  banner: (scope: { root: string }) => `Initializing tagoio in ${scope.root}...`,
  overwriteConfirmCopy: () => "OVERWRITE_COPY_STUB",
  startStep: vi.fn(),
  endStep: vi.fn(),
  // Real failStep is typed `never` and calls process.exit(1); model that here
  // so callers can't fall through after a failed step.
  failStep: (label: string) => {
    throw new Error(`__failStep:${label}`);
  },
  summaryBlock: () => "SUMMARY_BLOCK_STUB",
}));

vi.mock("../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("./login.js", () => ({
  getTagoDeployURL: vi.fn(),
  tagoLogin: vi.fn(),
}));

vi.mock("../prompt/text-prompt.js", () => ({
  promptTextToEnter: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return {
      profiles: { info: async () => ({ info: { id: "6a91f697b1ccff000c3eb271", name: "Third" } }) },
      info: async () => ({ email: "dev@example.com" }),
    };
  },
}));

const localScope = {
  scope: "local" as const,
  root: "/repo",
  configPath: "/repo/tagoconfig.json",
  envFilePath: "/repo/.tagoio/personal.env",
  configExists: true,
};

const freshState = {
  scope: localScope,
  isTTY: true,
  configExists: true,
  envExists: false,
  tokenExists: false,
};

const reInitState = {
  scope: localScope,
  isTTY: true,
  configExists: true,
  envExists: true,
  tokenExists: true,
};

describe("startConfig — clig.dev flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detectInitStateMock.mockReset();
    errorHandlerMock.mockClear();
    exitMock.mockClear();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("re-init confirm-no exits with 'Cancelled. No changes made.'", async () => {
    detectInitStateMock.mockReturnValue(reInitState);
    const { getConfigFile } = await import("../lib/config-file.js");
    (getConfigFile as ReturnType<typeof vi.fn>).mockReturnValue({ dev: { id: "x" } });

    const promptsModule = await import("prompts");
    // First inject is the "Overwrite?" prompt → user says no.
    promptsModule.default.inject([false]);

    const { startConfig } = await import("./start-config.js");
    await expect(startConfig("dev", { token: undefined })).rejects.toThrow(/__exit:0/);
  });

  test("re-init with --force skips the overwrite confirm prompt", async () => {
    detectInitStateMock.mockReturnValue(reInitState);
    const { getConfigFile } = await import("../lib/config-file.js");
    (getConfigFile as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const { startConfig } = await import("./start-config.js");
    // No prompt injection — if a prompt fires, it would hang. With --force we expect
    // it to skip the confirm and proceed; getConfigFile returns undefined, so the
    // "Creating project structure" stage fails via failStep (which aborts).
    await expect(startConfig("dev", { token: "tok-1", force: true })).rejects.toThrow(/__failStep:Creating project structure/);
  });

  /**
   * writeConfigFileEnv replaces the whole env block and init has no widget
   * prompt, so a re-init that dropped widgetList would silently erase every
   * custom widget mapping.
   */
  test("re-init keeps the environment's widgetList", async () => {
    detectInitStateMock.mockReturnValue(reInitState);
    const widgetList = [{ folder: "users-summary", dashboard_id: "6a68b4f5e4b1e5000b5ab1ef", widget_id: "6ad1084c174a0b000cb231a4" }];
    const { getConfigFile, writeConfigFileEnv } = await import("../lib/config-file.js");
    (getConfigFile as ReturnType<typeof vi.fn>).mockReturnValue({
      analysisPath: "./src",
      buildPath: "./build",
      dev: { id: "x", analysisList: [], widgetList },
    });

    const { startConfig } = await import("./start-config.js");
    await startConfig("dev", { token: "tok-1", input: false, force: true });

    expect((writeConfigFileEnv as ReturnType<typeof vi.fn>).mock.calls[0][1].widgetList).toEqual(widgetList);
  });

  test("--no-input + existing env without --force errors with the --force hint", async () => {
    detectInitStateMock.mockReturnValue(reInitState);

    const { startConfig } = await import("./start-config.js");
    await expect(startConfig("dev", { token: "tok-1", input: false })).rejects.toThrow();
    const errArg = errorHandlerMock.mock.calls[0][0] as string;
    expect(errArg).toContain("--force");
    expect(errArg).toContain("already exists");
  });

  test("--no-input without --token errors before any work", async () => {
    detectInitStateMock.mockReturnValue(freshState);
    const { getConfigFile } = await import("../lib/config-file.js");
    (getConfigFile as ReturnType<typeof vi.fn>).mockReturnValue({});

    const { startConfig } = await import("./start-config.js");
    await expect(startConfig("dev", { input: false })).rejects.toThrow();
    const errArg = errorHandlerMock.mock.calls[0][0] as string;
    expect(errArg).toContain("--no-input requires --token");
  });

  test("--name flag overrides positional argument and emits a stderr note", async () => {
    detectInitStateMock.mockReturnValue(reInitState);
    const { startConfig } = await import("./start-config.js");
    // Re-init w/ --no-input should error after the env-name resolution; that's enough
    // to exercise the override path.
    await expect(startConfig("positional", { name: "fromflag", input: false })).rejects.toThrow();

    // Detect was called with the flag value, not the positional.
    expect(detectInitStateMock).toHaveBeenCalledWith("fromflag");
  });

  test("uses default env 'dev' when neither positional nor --name is set", async () => {
    detectInitStateMock.mockReturnValue(reInitState);
    const { startConfig } = await import("./start-config.js");
    await expect(startConfig("", { input: false })).rejects.toThrow();

    expect(detectInitStateMock).toHaveBeenCalledWith("dev");
  });

  test("invalid --scope value errors actionably", async () => {
    const { startConfig } = await import("./start-config.js");
    await expect(startConfig("dev", { scope: "bogus" as never })).rejects.toThrow();
    const errArg = errorHandlerMock.mock.calls[0][0] as string;
    expect(errArg).toContain("Invalid --scope");
    expect(errArg).toContain("'bogus'");
  });
});

describe("analysis file matching", () => {
  let tmpRoot: string;
  const originalCwd = process.cwd();

  const touch = (relativeFile: string) => {
    const fullPath = join(tmpRoot, relativeFile);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, "");
  };

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "scan-analysis-"));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("scanAnalysisFiles collects .ts, .js and .luau files across nested directories", async () => {
    touch("root.ts");
    touch("skip.txt");
    touch("nested/deep.js");
    touch("nested/uplink-handler.luau");

    const { scanAnalysisFiles } = await import("./start-config.js");
    const collected = scanAnalysisFiles(tmpRoot);

    expect(collected).toEqual(
      expect.arrayContaining([
        { filename: "root.ts", relativePath: "" },
        { filename: "deep.js", relativePath: "nested" },
        { filename: "uplink-handler.luau", relativePath: "nested" },
      ]),
    );
    expect(collected.map((x) => x.filename)).not.toContain("skip.txt");
  });

  test("scanAnalysisFiles skips build, tests, typings, dependencies and symlinks in a project-root scan", async () => {
    touch("luau/analysis/uplink.luau");
    touch("app/analysis/report.ts");
    touch("app/analysis/report.test.ts");
    touch("luau/analysis/uplink.spec.luau");
    touch("app/analysis/report.spec.js");
    touch("app/types/global.d.ts");
    touch("node_modules/pkg/index.js");
    touch(".git/hooks/pre-commit.js");
    touch("build/app/report.tagoio.js");
    touch("build/uplink.tago.luau");
    symlinkSync(join(tmpRoot, "missing.ts"), join(tmpRoot, "broken-link.ts"));

    const { scanAnalysisFiles } = await import("./start-config.js");
    const collected = scanAnalysisFiles(tmpRoot, join(tmpRoot, "build"));

    expect(collected).toHaveLength(2);
    expect(collected).toEqual(
      expect.arrayContaining([
        { filename: "uplink.luau", relativePath: "luau/analysis" },
        { filename: "report.ts", relativePath: "app/analysis" },
      ]),
    );
  });

  test("findAnalysisFiles resolves paths from the project root, not the current directory", async () => {
    touch("luau/analysis/uplink.luau");
    touch("build/uplink.tago.luau");
    process.chdir(join(tmpRoot, "luau"));

    const { findAnalysisFiles } = await import("./start-config.js");
    const collected = findAnalysisFiles({ root: tmpRoot, analysisPath: "./", buildPath: "./build" });

    expect(collected).toEqual([{ filename: "uplink.luau", relativePath: "luau/analysis" }]);
  });

  test("findAnalysisFiles returns undefined when the analysis folder is missing", async () => {
    const { findAnalysisFiles } = await import("./start-config.js");

    expect(findAnalysisFiles({ root: tmpRoot, analysisPath: "./src/analysis" })).toBeUndefined();
  });

  test("getAnalysisScripts saves the chosen file and its folder", async () => {
    touch("luau/analysis/uplink.luau");
    const prompts = (await import("prompts")).default;
    prompts.inject([{ filename: "uplink.luau", relativePath: "luau/analysis" }]);

    const { getAnalysisScripts } = await import("./start-config.js");
    const result = await getAnalysisScripts([{ id: "an-1", name: "Uplink", fileName: "uplink" }], { root: tmpRoot, analysisPath: "./" });

    expect(result).toEqual([{ id: "an-1", name: "Uplink", fileName: "uplink.luau", path: "luau/analysis" }]);
  });

  test("getAnalysisScripts clears a stale path when a root-level file is chosen", async () => {
    touch("uplink.luau");
    const prompts = (await import("prompts")).default;
    prompts.inject([{ filename: "uplink.luau", relativePath: "" }]);

    const { getAnalysisScripts } = await import("./start-config.js");
    const result = await getAnalysisScripts([{ id: "an-1", name: "Uplink", fileName: "old.luau", path: "old" }], {
      root: tmpRoot,
      analysisPath: "./",
    });

    expect(result).toEqual([{ id: "an-1", name: "Uplink", fileName: "uplink.luau", path: undefined }]);
  });

  test("getAnalysisScripts clears the file and path on Skip", async () => {
    touch("uplink.luau");
    const prompts = (await import("prompts")).default;
    prompts.inject([">skip-selector"]);

    const { getAnalysisScripts } = await import("./start-config.js");
    const result = await getAnalysisScripts([{ id: "an-1", name: "Uplink", fileName: "uplink.luau", path: "old" }], {
      root: tmpRoot,
      analysisPath: "./",
    });

    expect(result).toEqual([{ id: "an-1", name: "Uplink", fileName: "", path: undefined }]);
  });

  test("getAnalysisScripts aborts init on Ctrl+C instead of treating it as Skip", async () => {
    touch("uplink.luau");
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    const prompts = (await import("prompts")).default;
    prompts.inject([new Error("cancelled")]);

    const { getAnalysisScripts } = await import("./start-config.js");
    const analysisList = [{ id: "an-1", name: "Uplink", fileName: "uplink.luau", path: "old" }];

    await expect(getAnalysisScripts(analysisList, { root: tmpRoot, analysisPath: "./" })).rejects.toThrow("__exit:0");
    expect(analysisList[0]).toEqual({ id: "an-1", name: "Uplink", fileName: "uplink.luau", path: "old" });
  });

  test("matchAnywhere filters choices by any part of the title, ignoring case", async () => {
    const { matchAnywhere } = await import("./start-config.js");
    const choices = [{ title: "luau/analysis/uplink.luau" }, { title: "app/analysis/report.ts" }];

    await expect(matchAnywhere("UPLINK", choices)).resolves.toEqual([{ title: "luau/analysis/uplink.luau" }]);
    await expect(matchAnywhere("analysis/", choices)).resolves.toHaveLength(2);
  });
});
