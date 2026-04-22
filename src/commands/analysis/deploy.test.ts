import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const successMSGMock = vi.fn();
const readFileMock = vi.fn();
const statMock = vi.fn();
const unlinkMock = vi.fn();
const execSyncMock = vi.fn();
const detectRuntimeMock = vi.fn();

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
  },
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/current-runtime.js", () => ({
  detectRuntime: detectRuntimeMock,
}));

vi.mock("../../lib/get-current-folder.js", () => ({
  getCurrentFolder: () => "/repo",
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
  highlightMSG: (s: string) => s,
}));

describe("deployAnalysis", () => {
  const analysisList = [
    { name: "scriptA", fileName: "a.ts", id: "an-1" },
  ];

  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    successMSGMock.mockClear();
    readFileMock.mockReset();
    statMock.mockReset().mockResolvedValue(null);
    unlinkMock.mockReset();
    execSyncMock.mockReset();
    detectRuntimeMock.mockReset().mockReturnValue("--node");
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
    resetInjectedPrompts();
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("a.ts", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/Environment not found/);
  });

  test("deploys a single matched script and emits a success message", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/__exit:0/);

    expect(execSyncMock).toHaveBeenCalled();
    expect(accountInstance.analysis.uploadScript).toHaveBeenCalledWith(
      "an-1",
      expect.objectContaining({ content: "ZmFrZS1zY3JpcHQ=" }),
    );
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("Script uploaded."));
  });

  test("rejects when both --deno and --node are specified together", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: true, node: true }),
    ).rejects.toThrow(/Cannot specify both/);
  });

  test("errors when no analysis name matches the search", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: [] }));

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("nope", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/No analysis found/);
  });

  test("uses chooseAnalysisListFromConfig prompt when 'all' is passed", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");

    prompts.inject([[analysisList[0]]]);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("all", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).toHaveBeenCalled();
  });

  test("bundles with deno when --deno flag is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "deno" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: true, node: false }),
    ).rejects.toThrow(/__exit:0/);

    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("deno bundle"),
      expect.any(Object),
    );
    logSpy.mockRestore();
  });

  test("logs 'deploying with node' when --node flag is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue("ZmFrZS1zY3JpcHQ=");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { deployAnalysis } = await import("./deploy.js");
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: false, node: true }),
    ).rejects.toThrow(/__exit:0/);

    expect(logSpy).toHaveBeenCalledWith("deploying with node");
    logSpy.mockRestore();
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
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/__exit:0/);

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
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/__exit:0/);

    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("nested/a.ts"),
      expect.any(Object),
    );
  });

  test("returns silently when reading the built file fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ runtime: "node" });
    readFileMock.mockRejectedValue(new Error("file gone"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { deployAnalysis } = await import("./deploy.js");
    // script read fails → buildScript returns early → loop finishes → process.exit()
    await expect(
      deployAnalysis("scriptA", { environment: "prod", silent: true, deno: false, node: false }),
    ).rejects.toThrow(/__exit:0/);

    expect(accountInstance.analysis.uploadScript).not.toHaveBeenCalled();
  });
});
