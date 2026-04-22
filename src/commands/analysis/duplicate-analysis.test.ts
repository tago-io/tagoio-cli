import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchArrayBufferResponse } from "../../test-utils/mock-fetch.js";
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

let fetchMock: ReturnType<typeof installFetchMock>;

vi.mock("node:zlib", () => ({
  default: {
    gunzipSync: vi.fn((buf: Buffer) => buf),
  },
  gunzipSync: vi.fn((buf: Buffer) => buf),
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
  highlightMSG: (s: string) => s,
}));

describe("duplicateAnalysis", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    successMSGMock.mockClear();
    fetchMock = installFetchMock();
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { duplicateAnalysis } = await import("./duplicate-analysis.js");
    await expect(duplicateAnalysis("an-1", { environment: "prod" })).rejects.toThrow(/Environment not found/);
  });

  test("calls errorHandler when the analysis ID cannot be resolved", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.analysis.info.mockResolvedValue(null);

    const { duplicateAnalysis } = await import("./duplicate-analysis.js");
    // account.analysis.info mocked to resolve to null → errorHandler path
    accountInstance.analysis.info.mockImplementation(() => Promise.reject(new Error("404")));

    await expect(duplicateAnalysis("bad-id", { environment: "prod" })).rejects.toThrow(/can't be found/);
  });

  test("creates a new analysis and emits structured success output when a name is provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.analysis.info.mockResolvedValue({
      id: "an-1",
      name: "Original",
      runtime: "node",
    });
    accountInstance.analysis.downloadScript.mockResolvedValue({ url: "https://cdn.tago.io/s.gz" });
    accountInstance.analysis.create.mockResolvedValue({ id: "an-2" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);

    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(Buffer.from("console.log(1)")));

    const { duplicateAnalysis } = await import("./duplicate-analysis.js");
    await duplicateAnalysis("an-1", { environment: "prod", name: "Duplicated" });

    expect(accountInstance.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Duplicated" }),
    );
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("source=an-1"));
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("target=an-2"));
  });

  test("prompts for a new name when none is provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.analysis.info.mockResolvedValue({
      id: "an-1",
      name: "Original",
      runtime: "node",
    });
    accountInstance.analysis.downloadScript.mockResolvedValue({ url: "https://cdn.tago.io/s.gz" });
    accountInstance.analysis.create.mockResolvedValue({ id: "an-2" });
    accountInstance.analysis.uploadScript.mockResolvedValue(undefined);

    fetchMock.mockResolvedValue(makeFetchArrayBufferResponse(Buffer.from("console.log(1)")));

    prompts.inject(["Picked-Name"]);

    const { duplicateAnalysis } = await import("./duplicate-analysis.js");
    await duplicateAnalysis("an-1", { environment: "prod" });

    // The "newAnalysisName" used in create is the default `${analysis.name} - Copy` — the prompt result
    // is stashed back into options.name but the created name comes from the default computation.
    expect(accountInstance.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Original - Copy" }),
    );
  });
});
