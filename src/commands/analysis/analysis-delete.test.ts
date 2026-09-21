import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});
const pickAnalysisMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-analysis-from-tagoio.js", () => ({
  pickAnalysisFromTagoIO: pickAnalysisMock,
}));

describe("analysisDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickAnalysisMock.mockReset().mockResolvedValue({ id: "ana1", name: "Alert Dispatch" });
    resourcesInstance.analysis.info.mockResolvedValue({ id: "ana1", name: "Alert Dispatch" });
    resourcesInstance.analysis.delete.mockResolvedValue("Successfully Removed");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { analysisDelete } = await import("./analysis-delete.js");
    await expect(analysisDelete("ana1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("deletes after the confirmation is accepted", async () => {
    prompts.inject([true]);

    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete("ana1", {} as never);

    expect(resourcesInstance.analysis.delete).toHaveBeenCalledWith("ana1");
  });

  test("declining makes no delete call", async () => {
    prompts.inject([false]);

    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete("ana1", {} as never);

    expect(resourcesInstance.analysis.delete).not.toHaveBeenCalled();
  });

  /**
   * Asserted through the exported builder, since the module calls `prompts(...)`
   * as a function and a spy on `prompts.prompt` never intercepts that.
   */
  test("the confirmation names the analysis", async () => {
    const { buildDeleteMessage } = await import("./analysis-delete.js");

    expect(buildDeleteMessage('analysis "Alert Dispatch"')).toContain("Alert Dispatch");
  });

  test("the confirmation says the script goes with it", async () => {
    const { buildDeleteMessage } = await import("./analysis-delete.js");

    expect(buildDeleteMessage('analysis "Alert Dispatch"')).toMatch(/script/i);
  });

  /**
   * Scheduling lives in Actions: an Action of type `interval` whose
   * `action.script` targets an analysis id. That relationship is invisible from
   * the analysis side, so the prompt has to name it.
   */
  test("the confirmation warns that Actions referencing it stop firing", async () => {
    const { buildDeleteMessage } = await import("./analysis-delete.js");

    expect(buildDeleteMessage('analysis "Alert Dispatch"')).toMatch(/action/i);
  });

  test("describeTarget names the analysis when the lookup succeeds", async () => {
    const { describeTarget } = await import("./analysis-delete.js");

    await expect(describeTarget(resourcesInstance as never, "ana1")).resolves.toContain("Alert Dispatch");
  });

  /** A failed read must not block a delete. */
  test("describeTarget falls back to the id when the lookup fails", async () => {
    resourcesInstance.analysis.info.mockRejectedValue(new Error("nope"));

    const { describeTarget } = await import("./analysis-delete.js");

    await expect(describeTarget(resourcesInstance as never, "ana1")).resolves.toContain("ana1");
  });

  test("a failed lookup still allows the delete", async () => {
    resourcesInstance.analysis.info.mockRejectedValue(new Error("nope"));
    prompts.inject([true]);

    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete("ana1", {} as never);

    expect(resourcesInstance.analysis.delete).toHaveBeenCalledWith("ana1");
  });

  test("-y deletes without prompting", async () => {
    const promptSpy = vi.spyOn(prompts, "prompt");

    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete("ana1", { yes: true } as never);

    expect(promptSpy).not.toHaveBeenCalled();
    expect(resourcesInstance.analysis.delete).toHaveBeenCalledWith("ana1");
  });

  test("--silent deletes without prompting", async () => {
    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete("ana1", { silent: true } as never);

    expect(resourcesInstance.analysis.delete).toHaveBeenCalledWith("ana1");
  });

  test("prompts for the analysis when the id is omitted", async () => {
    prompts.inject([true]);

    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete(undefined, {} as never);

    expect(pickAnalysisMock).toHaveBeenCalled();
    expect(resourcesInstance.analysis.delete).toHaveBeenCalledWith("ana1");
  });

  test("--silent without an id fails and deletes nothing", async () => {
    const { analysisDelete } = await import("./analysis-delete.js");
    await expect(analysisDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickAnalysisMock).not.toHaveBeenCalled();
    expect(resourcesInstance.analysis.delete).not.toHaveBeenCalled();
  });

  test("--json synthesizes an ack, since the SDK resolves a plain string", async () => {
    const { analysisDelete } = await import("./analysis-delete.js");
    await analysisDelete("ana1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "ana1", deleted: true });
  });

  test("an API rejection reports delete_failed", async () => {
    resourcesInstance.analysis.delete.mockRejectedValue(new Error("boom"));

    const { analysisDelete } = await import("./analysis-delete.js");
    await expect(analysisDelete("ana1", { yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.analysis.delete.mockRejectedValue(new Error("boom"));

    const { analysisDelete } = await import("./analysis-delete.js");
    await expect(analysisDelete("ana1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
