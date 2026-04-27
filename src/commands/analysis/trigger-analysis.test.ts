import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const infoMSGMock = vi.fn();
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
  infoMSG: infoMSGMock,
  successMSG: successMSGMock,
  highlightMSG: (s: string) => s,
}));

describe("triggerAnalysis", () => {
  const analysisList = [
    { name: "myScript", fileName: "my-script.ts", id: "an-1" },
    { name: "otherScript", fileName: "other-script.ts", id: "an-2" },
  ];

  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    infoMSGMock.mockClear();
    successMSGMock.mockClear();
    resetInjectedPrompts();
  });

  test("runs the matched script by name and reports success", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.run.mockResolvedValue(undefined);

    const { triggerAnalysis } = await import("./trigger-analysis.js");
    await triggerAnalysis("myScript", { environment: "prod", tago: false });

    expect(accountInstance.analysis.run).toHaveBeenCalledWith("an-1", undefined);
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("Analysis triggered"));
  });

  test("calls errorHandler when the config/token is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { triggerAnalysis } = await import("./trigger-analysis.js");
    await expect(triggerAnalysis("myScript", { environment: "prod", tago: false })).rejects.toThrow(/Environment not found/);
  });

  test("calls errorHandler when the analysis list is empty (no script to match)", async () => {
    // searchName always returns the top result of a non-empty list, so "not found" is only
    // reachable when analysisList is empty.
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: [] }));

    const { triggerAnalysis } = await import("./trigger-analysis.js");
    await expect(triggerAnalysis("anything", { environment: "prod", tago: false })).rejects.toThrow(/Analysis not found/);
  });

  test("surfaces account.analysis.run errors via errorHandler", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.run.mockRejectedValue(new Error("run failed"));

    const { triggerAnalysis } = await import("./trigger-analysis.js");
    await expect(triggerAnalysis("myScript", { environment: "prod", tago: false })).rejects.toThrow(/run failed/);
  });

  test("prompts the user via config when no script name is provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.run.mockResolvedValue(undefined);
    prompts.inject([analysisList[1]]);

    const { triggerAnalysis } = await import("./trigger-analysis.js");
    await triggerAnalysis(undefined as never, { environment: "prod", tago: false });

    expect(accountInstance.analysis.run).toHaveBeenCalledWith("an-2", undefined);
  });
});
