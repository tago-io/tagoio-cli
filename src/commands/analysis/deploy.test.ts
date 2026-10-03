import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn<(str: unknown) => void>((str) => {
  throw new Error(String(str));
});
const successMSGMock = vi.fn();
const infoMSGMock = vi.fn();
const readFileMock = vi.fn();
const statMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const unlinkMock = vi.fn();
const execSyncMock = vi.fn();
const execFileSyncMock = vi.fn();
const detectRuntimeMock = vi.fn();
const chooseAnalysisListFromConfigMock = vi.fn();
const confirmAnalysisFromConfigMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

vi.mock("node:fs", () => ({
  promises: {
    readFile: readFileMock,
    stat: statMock,
    unlink: unlinkMock,
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
  execFileSync: execFileSyncMock,
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/current-runtime.js", () => ({
  detectRuntime: detectRuntimeMock,
}));

const localScope = {
  scope: "local" as const,
  root: "/repo",
  configPath: "/repo/tagoconfig.json",
  envFilePath: "/repo/.tagoio/personal.env",
  configExists: true,
};
const requireLocalScopeMock = vi.fn(() => localScope);

vi.mock("../../lib/resolve-scope.js", () => ({
  requireLocalScope: () => requireLocalScopeMock(),
}));

vi.mock("../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
  infoMSG: infoMSGMock,
  highlightMSG: (s: string) => s,
}));

vi.mock("../../prompt/choose-analysis-list-config.js", () => ({
  chooseAnalysisListFromConfig: (...args: unknown[]) => chooseAnalysisListFromConfigMock(...args),
}));

vi.mock("../../prompt/confirm-analysis-list.js", () => ({
  confirmAnalysisFromConfig: (...args: unknown[]) => confirmAnalysisFromConfigMock(...args),
}));

describe("deployAnalysis", () => {
  const analysisList = [{ name: "scriptA", fileName: "a.ts", id: "an-1" }];

  /** Default CLI options shape — individual tests override fields as needed. */
  const defaultOptions = () => ({
    environment: "prod",
    silent: true,
    deno: false,
    node: false,
    luau: false,
    all: false,
  });

  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockReset().mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
    successMSGMock.mockClear();
    infoMSGMock.mockClear();
    readFileMock.mockReset();
    statMock.mockReset().mockResolvedValue(null);
    mkdirMock.mockReset().mockResolvedValue(undefined);
    writeFileMock.mockReset().mockResolvedValue(undefined);
    unlinkMock.mockReset();
    execSyncMock.mockReset();
    execFileSyncMock.mockReset();
    detectRuntimeMock.mockReset().mockReturnValue("--node");
    chooseAnalysisListFromConfigMock.mockReset();
    confirmAnalysisFromConfigMock.mockReset();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    resetInjectedPrompts();
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  test("errors when no profile token is available (no lock file and no --token)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("a.ts", defaultOptions())).rejects.toThrow(/No profile token found/);
  });

  test("deploys a single matched script and emits a success message", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(execSyncMock).toHaveBeenCalled();
    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledWith("an-1", expect.objectContaining({ content: "ZmFrZS1zY3JpcHQ=" }));
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("Script uploaded."));
  });

  test("deploys only the named analysis when silent", async () => {
    const list = [
      { name: "scriptA", fileName: "a.ts", id: "an-1" },
      { name: "scriptB", fileName: "b.ts", id: "an-2" },
    ];
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: list }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptB", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledTimes(1);
    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledWith("an-2", expect.any(Object));
  });

  test("deploys only the named analysis when silent", async () => {
    const list = [
      { name: "scriptA", fileName: "a.ts", id: "an-1" },
      { name: "scriptB", fileName: "b.ts", id: "an-2" },
    ];
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: list }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptB", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledTimes(1);
    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledWith("an-2", expect.any(Object));
  });

  test("rejects when more than one runtime flag is specified", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), deno: true, node: true })).rejects.toThrow(/Cannot specify more than one/);
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), deno: true, luau: true })).rejects.toThrow(/Cannot specify more than one/);
  });

  describe("luau", () => {
    const luauList = [{ name: "uplink", fileName: "uplink-handler.luau", id: "an-9", path: "actions" }];
    const bundle = 'local __DARKLUA_BUNDLE_MODULES={cache={}}\nAnalysis.use(function(context, scope) print("ok") end)';

    /** utf8 reads return the bundle for the checks; base64 reads return the upload content. */
    const mockBuiltFile = (source: string) => {
      readFileMock.mockImplementation((_file: string, { encoding }: { encoding: string }) =>
        Promise.resolve(encoding === "utf8" ? source : Buffer.from(source).toString("base64")),
      );
    };

    beforeEach(() => {
      getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: luauList }));
      accountInstance.analysis.info.mockResolvedValue({ runtime: "luau-rt2026" });
      accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
      accountInstance.analysis.edit.mockResolvedValue(undefined);
      detectRuntimeMock.mockReturnValue("--luau");
    });

    test("bundles with darklua and uploads a .luau file on the Luau runtime", async () => {
      mockBuiltFile(bundle);

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/__exit:0/);

      expect(execSyncMock).not.toHaveBeenCalled();
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "darklua",
        [
          "process",
          "--config",
          expect.any(String),
          expect.stringMatching(/\/actions\/uplink-handler\.luau$/),
          expect.stringMatching(/\/uplink-handler\.tago\.luau$/),
        ],
        expect.objectContaining({ cwd: "/repo" }),
      );
      expect(accountInstance.analysis.uploadScript).toHaveBeenCalledWith("an-9", {
        content: Buffer.from(bundle).toString("base64"),
        name: "uplink-handler.tago.luau",
        language: "luau-rt2026",
      });
    });

    test("writes a default bundling config when the project has no .darklua.json", async () => {
      mockBuiltFile(bundle);

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/__exit:0/);

      expect(writeFileMock).toHaveBeenCalledWith(expect.stringContaining("darklua.tago.json"), JSON.stringify({ bundle: { require_mode: "luau" }, rules: [] }));
      expect(execFileSyncMock.mock.calls[0][1][2]).toContain("darklua.tago.json");
    });

    test("uses the project's .darklua.json when it has one", async () => {
      mockBuiltFile(bundle);
      statMock.mockImplementation((file: string) => Promise.resolve(file.endsWith(".darklua.json") ? { isFile: () => true } : null));
      unlinkMock.mockResolvedValue(undefined);

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/__exit:0/);

      expect(writeFileMock).not.toHaveBeenCalled();
      expect(execFileSyncMock.mock.calls[0][1][2]).toBe("/repo/.darklua.json");
    });

    test("refuses a bundle that still calls require", async () => {
      mockBuiltFile('local scope = require("./lib/scope")');

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/still calls require/);
      expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
    });

    test("refuses a bundle over the 64 KiB Luau limit", async () => {
      mockBuiltFile(`-- ${"x".repeat(64 * 1024)}`);

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/at most 65536/);
      expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
    });

    test("passes a project path with spaces to darklua as one argument", async () => {
      mockBuiltFile(bundle);
      statMock.mockImplementation((file: string) => Promise.resolve(file.endsWith(".darklua.json") ? { isFile: () => true } : null));
      unlinkMock.mockResolvedValue(undefined);
      requireLocalScopeMock.mockReturnValueOnce({ ...localScope, root: "/My Projects/app; rm -rf ~" });

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/__exit:0/);

      expect(execFileSyncMock.mock.calls[0][1][2]).toBe("/My Projects/app; rm -rf ~/.darklua.json");
    });

    test("points to the darklua install when it is missing", async () => {
      execFileSyncMock.mockImplementationOnce(() => {
        throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
      });

      const { deployAnalysis } = await import("./deploy.js");
      await expect(deployAnalysis("uplink", defaultOptions())).rejects.toThrow(/Build tool 'darklua' not found. Install it with: brew install darklua/);
    });
  });

  test("errors when no analysis name matches the search", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: [] }));

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("nope", defaultOptions())).rejects.toThrow(/No analysis found/);
  });

  test("rejects the legacy 'all' positional with a pointer to --all", async () => {
    // No env config needed — the check runs before getEnvironmentConfig.
    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("all", defaultOptions())).rejects.toThrow(
      'Did you mean "tagoio deploy --all"? The "all" positional argument is no longer supported.',
    );
    expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("--all deploys every analysis from the config without prompting", async () => {
    const list = [
      { name: "scriptA", fileName: "a.ts", id: "an-1" },
      { name: "scriptB", fileName: "b.ts", id: "an-2" },
    ];
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: list }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("", { ...defaultOptions(), all: true })).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledTimes(2);
  });

  test("-t/--token overrides the lock-file token for this run", async () => {
    // Simulate a CI runner: env config exists but carries no token.
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList, profileToken: "" }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), token: "ci-token" })).rejects.toThrow(/__exit:0/);

    // Upload was reached → the token override made it past the auth gate.
    expect(accountInstance.analysis.uploadScript).toHaveBeenCalled();
  });

  test("--all + -t/--token works end-to-end with no lock file (CI flow)", async () => {
    const list = [
      { name: "scriptA", fileName: "a.ts", id: "an-1" },
      { name: "scriptB", fileName: "b.ts", id: "an-2" },
    ];
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: list, profileToken: "" }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("", { ...defaultOptions(), all: true, token: "ci-token" })).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledTimes(2);
  });

  test("bundles with deno when --deno flag is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "deno" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), deno: true })).rejects.toThrow(/__exit:0/);

    expect(execSyncMock).toHaveBeenCalledWith(expect.stringContaining("deno bundle"), expect.any(Object));
    expect(infoMSGMock).toHaveBeenCalledWith(expect.stringContaining("deno"));
  });

  test("routes ENOENT from execSync through errorHandler with the install hint (analysis-builder missing)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    detectRuntimeMock.mockReturnValue("node");
    const enoent = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    execSyncMock.mockImplementationOnce(() => {
      throw enoent;
    });

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/Build tool '@tago-io\/builder' not found/);
    expect(errorHandlerMock).toHaveBeenCalledWith(expect.stringContaining("npm install -g @tago-io/builder"));
  });

  test("routes exit-127 (deno missing) through errorHandler with the deno install hint", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "deno" });
    const status127 = Object.assign(new Error("Command failed: deno bundle ..."), { status: 127 });
    execSyncMock.mockImplementationOnce(() => {
      throw status127;
    });

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), deno: true })).rejects.toThrow(/Build tool 'deno' not found/);
    expect(errorHandlerMock).toHaveBeenCalledWith(expect.stringContaining("deno.land"));
  });

  test("routes a generic execSync failure through errorHandler as a build-failed message", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    detectRuntimeMock.mockReturnValue("node");
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("Bundling failed: type error");
    });

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/Build failed for a\.ts/);
    expect(errorHandlerMock).toHaveBeenCalledWith(expect.stringContaining("Bundling failed"));
  });

  test("emits an [INFO] line announcing the node runtime when --node flag is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), node: true })).rejects.toThrow(/__exit:0/);

    expect(infoMSGMock).toHaveBeenCalledWith(expect.stringContaining("node"));
  });

  test("deletes the old built file when stat finds it", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");
    statMock.mockResolvedValue({ isFile: () => true });
    unlinkMock.mockResolvedValue(undefined);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(unlinkMock).toHaveBeenCalled();
  });

  test("builds with a nested path when the script declares one", async () => {
    const listWithPath = [{ name: "scriptA", fileName: "a.ts", id: "an-1", path: "nested" }];
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: listWithPath }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(execSyncMock).toHaveBeenCalledWith(expect.stringContaining("nested/a.ts"), expect.any(Object));
  });

  test("returns silently when reading the built file fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    readFileMock.mockRejectedValue(new Error("file gone"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { deployAnalysis } = await import("./deploy.js");
    // script read fails → buildScript returns early → loop finishes → process.exit()
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("returns silently when analysis.info rejects", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockRejectedValue(new Error("nope"));
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");
    // errorHandler runs twice: once via analysis.info .catch, once via unknown flow.
    // We only care that uploadScript was never reached — the exact exit path doesn't matter for coverage.
    errorHandlerMock.mockImplementation(() => undefined);

    const { deployAnalysis } = await import("./deploy.js");
    // Don't assert the exact thrown message; just that the command resolves or throws w/o upload.
    await deployAnalysis("scriptA", defaultOptions()).catch(() => undefined);

    expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("routes uploadScript failure through errorHandler", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockRejectedValue(new Error("upload fail"));
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(errorHandlerMock).toHaveBeenCalledWith(expect.stringContaining("Script upload failed"));
  });

  test("defaults analysis and build paths when the env config omits them", async () => {
    getEnvironmentConfigMock.mockReturnValue({
      ...makeEnvironmentConfig({ analysisList }),
      analysisPath: undefined,
      buildPath: undefined,
    });
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    // First execSync call should reference the default paths
    expect(execSyncMock).toHaveBeenCalled();
    const cmd = execSyncMock.mock.calls[0][0] as string;
    expect(cmd).toContain("./src/analysis/a.ts");
    expect(cmd).toContain("./build/a.tago.js");
  });

  test("returns error when getEnvironmentConfig yields undefined", async () => {
    getEnvironmentConfigMock.mockReturnValue(undefined);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/Environment not found/);
    expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("opens the interactive picker when no script name and --all are provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    chooseAnalysisListFromConfigMock.mockResolvedValue(analysisList);
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(chooseAnalysisListFromConfigMock).toHaveBeenCalled();
  });

  test("prompts for confirmation when silent is false and a name is provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    confirmAnalysisFromConfigMock.mockResolvedValue(analysisList);
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", { ...defaultOptions(), silent: false })).rejects.toThrow(/__exit:0/);

    expect(confirmAnalysisFromConfigMock).toHaveBeenCalled();
  });

  test("cancels with a clear error when the interactive picker returns an empty list", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    chooseAnalysisListFromConfigMock.mockResolvedValue([]);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("", defaultOptions())).rejects.toThrow(/Cancelled/);

    expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });

  test("sets run_on to 'tago' after a successful upload", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(deployAnalysis("scriptA", defaultOptions())).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.edit).toHaveBeenCalledWith("an-1", { run_on: "tago" });
  });
});
