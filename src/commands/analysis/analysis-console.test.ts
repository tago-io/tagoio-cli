import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

type SSECallback = (event?: unknown) => void;
let accountInstance: ReturnType<typeof makeAccount>;
const eventSourceInstances: Array<{ url: string; onmessage?: SSECallback; onerror?: SSECallback; onopen?: SSECallback }> = [];

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

vi.mock("eventsource", () => ({
  EventSource: function EventSource(url: string) {
    const inst = { url, onmessage: undefined, onerror: undefined, onopen: undefined };
    eventSourceInstances.push(inst);
    return inst;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
  highlightMSG: (s: string) => s,
}));

describe("connectAnalysisConsole", () => {
  const analysisList = [{ name: "script", fileName: "script.ts", id: "an-1" }];

  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    eventSourceInstances.length = 0;
    resetInjectedPrompts();
  });

  test("opens an SSE connection for the matched script", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ id: "an-1", name: "script" });

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await connectAnalysisConsole("script", { environment: "prod" });

    expect(eventSourceInstances).toHaveLength(1);
    expect(eventSourceInstances[0].url).toContain("channel=analysis_console.an-1");
    expect(eventSourceInstances[0].url).toContain("token=fake-token");
  });

  test("calls errorHandler when the config is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await expect(connectAnalysisConsole("script", { environment: "prod" })).rejects.toThrow(/Environment not found/);
  });

  test("calls errorHandler when the analysis info lookup fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockRejectedValue(new Error("404"));

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await expect(connectAnalysisConsole("script", { environment: "prod" })).rejects.toThrow(/couldn't be found/);
  });

  test("prompts for a script when none is provided via CLI", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ id: "an-1", name: "script" });
    prompts.inject([analysisList[0]]);

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await connectAnalysisConsole(undefined as never, { environment: "prod" });

    expect(eventSourceInstances).toHaveLength(1);
  });

  test("errors when scriptObj cannot be resolved", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList: [] }));
    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await expect(connectAnalysisConsole("missing", { environment: "prod" })).rejects.toThrow(/Analysis not found/);
  });

  test("onmessage logs the formatted payload", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ id: "an-1", name: "script" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await connectAnalysisConsole("script", { environment: "prod" });
    const sse = eventSourceInstances[0];
    sse.onmessage?.({
      data: JSON.stringify({ payload: { timestamp: "2026-01-01T00:00:00Z", message: "hello" } }),
    });
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("onopen emits the connected info messages", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ id: "an-1", name: "script" });

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await connectAnalysisConsole("script", { environment: "prod" });
    const sse = eventSourceInstances[0];
    expect(() => sse.onopen?.()).not.toThrow();
  });

  test("onerror routes through errorHandler and logs the raw event", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ analysisList }));
    accountInstance.analysis.info.mockResolvedValue({ id: "an-1", name: "script" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { connectAnalysisConsole } = await import("./analysis-console.js");
    await connectAnalysisConsole("script", { environment: "prod" });
    const sse = eventSourceInstances[0];
    errorHandlerMock.mockImplementationOnce(() => undefined);
    sse.onerror?.({ type: "error" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
