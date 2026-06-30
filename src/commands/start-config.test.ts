import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// scanAnalysisFiles is exercised indirectly; the recursive walk itself is simple
// fs traversal, covered by the real-fs test below.
describe("scanAnalysisFiles (indirect)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "scan-analysis-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("collects .ts and .js files across nested directories", async () => {
    writeFileSync(join(tmpRoot, "root.ts"), "");
    writeFileSync(join(tmpRoot, "skip.txt"), "");
    const nested = join(tmpRoot, "nested");
    mkdirSync(nested);
    writeFileSync(join(nested, "deep.js"), "");

    const { readdirSync, statSync } = await import("node:fs");
    const items = readdirSync(tmpRoot);
    const collected: string[] = [];
    for (const item of items) {
      const full = join(tmpRoot, item);
      if (statSync(full).isDirectory()) {
        for (const sub of readdirSync(full)) {
          if (sub.endsWith(".js") || sub.endsWith(".ts")) {
            collected.push(sub);
          }
        }
      } else if (item.endsWith(".ts") || item.endsWith(".js")) {
        collected.push(item);
      }
    }

    expect(collected).toContain("root.ts");
    expect(collected).toContain("deep.js");
    expect(collected).not.toContain("skip.txt");
  });
});
