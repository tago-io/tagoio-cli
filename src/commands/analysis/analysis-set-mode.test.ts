import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const successMSGMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: successMSGMock,
  highlightMSG: (s: string) => s,
}));

vi.mock("../../lib/resolve-scope.js", () => ({
  requireLocalScope: () => ({
    scope: "local" as const,
    root: "/repo",
    configPath: "/repo/tagoconfig.json",
    envFilePath: "/repo/.tagoio/personal.env",
    configExists: true,
  }),
}));

describe("analysisSetMode", () => {
  // Factory — the command sorts these in place, so each test needs a fresh copy.
  const makeAnalyses = () => [
    { id: "an-1", name: "Script A", run_on: "tago" },
    { id: "an-2", name: "Script B", run_on: "external" },
  ];

  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    successMSGMock.mockClear();
    resetInjectedPrompts();
  });

  test("updates run_on for each selected analysis and emits a totals line", async () => {
    const analyses = makeAnalyses();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.analysis.list.mockResolvedValue(analyses);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    // 1st inject → chooseFromList selection, 2nd inject → pickFromList mode
    prompts.inject([[analyses[0]], "external"]);

    const { analysisSetMode } = await import("./analysis-set-mode.js");
    await analysisSetMode(undefined as never, { environment: "prod", mode: "", filterMode: "" });

    expect(accountInstance.analysis.edit).toHaveBeenCalledWith("an-1", { run_on: "external" });
    const totals = successMSGMock.mock.calls.find((c) => String(c[0]).includes("Total analyses updated"));
    expect(totals?.[0]).toContain("count=1");
    expect(totals?.[0]).toContain("run_on=");
  });

  test("calls errorHandler when the account returns no analyses", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.analysis.list.mockResolvedValue([]);

    const { analysisSetMode } = await import("./analysis-set-mode.js");
    await expect(
      analysisSetMode(undefined as never, { environment: "prod", mode: "", filterMode: "" }),
    ).rejects.toThrow(/No analysis found/);
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { analysisSetMode } = await import("./analysis-set-mode.js");
    await expect(
      analysisSetMode(undefined as never, { environment: "prod", mode: "", filterMode: "" }),
    ).rejects.toThrow(/Environment not found/);
  });

  test("skips mode prompt and uses options.mode directly when provided", async () => {
    const analyses = makeAnalyses();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.analysis.list.mockResolvedValue([analyses[1]]);
    accountInstance.analysis.edit.mockResolvedValue(undefined);
    // Only chooseFromList inject — no pickFromList since mode is set
    prompts.inject([[analyses[1]]]);

    const { analysisSetMode } = await import("./analysis-set-mode.js");
    await analysisSetMode(undefined as never, { environment: "prod", mode: "external", filterMode: "" });

    expect(accountInstance.analysis.edit).toHaveBeenCalledWith("an-2", { run_on: "external" });
  });
});
