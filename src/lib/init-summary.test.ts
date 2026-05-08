import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { InitState } from "./init-state.js";
import { ResolvedScope } from "./resolve-scope.js";

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

// kleur color codes muddy snapshot equality; strip them before assertion.
// oxlint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, "");

describe("init-summary", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("banner", () => {
    test("names the resolved scope root", async () => {
      const { banner } = await import("./init-summary.js");
      expect(banner(localScope)).toBe("Initializing tagoio in /repo...");
      expect(banner(globalScope)).toBe("Initializing tagoio in /home/user/.config/tagoio...");
    });
  });

  describe("overwriteConfirmCopy", () => {
    test("local scope names the global config dir as untouched", async () => {
      const { overwriteConfirmCopy } = await import("./init-summary.js");
      const state: InitState = { scope: localScope, isTTY: true, configExists: true, envExists: true, tokenExists: true };
      const copy = overwriteConfirmCopy(state, "dev");
      expect(copy).toContain("env 'dev'");
      expect(copy).toContain("/repo/tagoconfig.json");
      expect(copy).toContain("Reinitializing will overwrite");
      expect(copy).toContain("global config located in ~/.config/tagoio/");
    });

    test("global scope names the local config in projects as untouched", async () => {
      const { overwriteConfirmCopy } = await import("./init-summary.js");
      const state: InitState = { scope: globalScope, isTTY: true, configExists: true, envExists: true, tokenExists: true };
      const copy = overwriteConfirmCopy(state, "prod");
      expect(copy).toContain("env 'prod'");
      expect(copy).toContain("local config in any project directory");
    });
  });

  describe("step markers", () => {
    test("startStep writes [..] <label>... to stderr", async () => {
      const { startStep } = await import("./init-summary.js");
      startStep("Creating project structure");
      const written = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(written).toBe("[..] Creating project structure...\n");
    });

    test("endStep writes [OK] <label> to stderr", async () => {
      const { endStep } = await import("./init-summary.js");
      endStep("Created ./tagoconfig.json");
      const written = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(written).toBe("[OK] Created ./tagoconfig.json\n");
    });

    test("failStep writes [ERROR] <label>: <err.message> to stderr", async () => {
      const { failStep } = await import("./init-summary.js");
      failStep("Connecting", new Error("ENOTFOUND"));
      const written = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(written).toBe("[ERROR] Connecting: ENOTFOUND\n");
    });

    test("failStep without err prints just the label", async () => {
      const { failStep } = await import("./init-summary.js");
      failStep("Aborted");
      const written = stripAnsi(stderrSpy.mock.calls[0][0] as string);
      expect(written).toBe("[ERROR] Aborted\n");
    });
  });

  describe("summaryBlock", () => {
    test("formats files, scope, env name, profile name, and endpoint", async () => {
      const { summaryBlock } = await import("./init-summary.js");
      const out = summaryBlock({
        filesWritten: [
          { path: "./tagoconfig.json", description: "project configuration" },
          { path: "./.tago-lock.dev.lock", description: "encrypted profile token" },
        ],
        scope: "local",
        envName: "dev",
        profileName: "Tago Production",
        apiEndpoint: "https://api.tago.io",
        sseEndpoint: "https://sse.tago.io",
      });
      expect(out).toMatchSnapshot();
    });

    test("renders '(no files were written)' when filesWritten is empty", async () => {
      const { summaryBlock } = await import("./init-summary.js");
      const out = summaryBlock({
        filesWritten: [],
        scope: "global",
        envName: "prod",
        profileName: "Tago",
        apiEndpoint: "https://api.tago.io",
        sseEndpoint: "https://sse.tago.io",
      });
      expect(out).toContain("(no files were written)");
    });

    test("env name and profile name are rendered as separate lines", async () => {
      const { summaryBlock } = await import("./init-summary.js");
      const out = summaryBlock({
        filesWritten: [],
        scope: "local",
        envName: "smoke",
        profileName: "Tago",
        apiEndpoint: "https://api.tago.io",
        sseEndpoint: "https://sse.tago.io",
      });
      expect(out).toContain("Environment:  smoke");
      expect(out).toContain("Profile:      Tago");
      expect(out).toContain("API URL:      https://api.tago.io");
      expect(out).toContain("SSE URL:      https://sse.tago.io");
    });

    test("aligns description column when paths vary in length", async () => {
      const { summaryBlock } = await import("./init-summary.js");
      const out = summaryBlock({
        filesWritten: [
          { path: "/very/long/path/to/tagoconfig.json", description: "project configuration" },
          { path: "/short.lock", description: "token" },
        ],
        scope: "local",
        envName: "dev",
        profileName: "Tago",
        apiEndpoint: "https://api.tago.io",
        sseEndpoint: "https://sse.tago.io",
      });
      // Both lines should have at least one space between path and "(".
      const lines = out.split("\n").filter((l) => l.includes("(") && !l.startsWith("--"));
      for (const line of lines) {
        expect(line).toMatch(/\)\s*$|.+\s\(.+\)/);
      }
    });
  });
});
