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
  infoMSG: vi.fn(),
  writeStatus: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-analysis-from-tagoio.js", () => ({
  pickAnalysisFromTagoIO: pickAnalysisMock,
}));

/** Recognisable string proving no default path prints the analysis token. */
const SENTINEL = "SENTINEL_TOKEN_12345";

describe("analysisInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  const info = {
    id: "ana1",
    name: "Alert Dispatch",
    description: "Sends alerts",
    active: true,
    run_on: "external",
    runtime: "node-rt2025",
    file_name: "alert.js",
    token: SENTINEL,
    last_run: "never",
    created_at: new Date("2026-07-01T13:21:48.402Z"),
    updated_at: new Date("2026-08-07T18:58:19.001Z"),
    variables: [{ key: "A", value: "1" }],
    tags: [{ key: "env", value: "prod" }],
    version: 0,
    // Probed as returned by the API but absent from the SDK types.
    timeout: 120000,
    secrets: [],
    console: [],
  };

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickAnalysisMock.mockReset().mockResolvedValue({ id: "ana1", name: "Alert Dispatch" });
    resourcesInstance.analysis.info.mockResolvedValue(info);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { analysisInfo } = await import("./analysis-info.js");
    await expect(analysisInfo("ana1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches the analysis by the given id", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", {} as never);

    expect(resourcesInstance.analysis.info).toHaveBeenCalledWith("ana1");
  });

  /** The existing picker returns the full object, so the id comes off it. */
  test("prompts for the analysis when the id is omitted", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo(undefined, {} as never);

    expect(pickAnalysisMock).toHaveBeenCalled();
    expect(resourcesInstance.analysis.info).toHaveBeenCalledWith("ana1");
  });

  test("--silent without an id fails and never prompts", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await expect(analysisInfo(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickAnalysisMock).not.toHaveBeenCalled();
  });

  test("--json emits the record on stdout", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "ana1", name: "Alert Dispatch" });
  });

  /**
   * The rule this command exists to protect. `AnalysisInfo.token` authenticates
   * as the analysis, and unlike the secret and run-user families the credential
   * arrives from the API on every call — so the risk is printing it, not echoing
   * it back.
   *
   * The key is omitted entirely rather than masked: a `"***"` placeholder in
   * --json is something a script might try to parse and use.
   */
  test("--json has no token key by default", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).not.toHaveProperty("token");
  });

  test("the token reaches neither stream by default", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("the token reaches neither stream in human mode", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", {} as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("--raw alone does not reveal the token", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true, raw: true } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).not.toContain(SENTINEL);
  });

  /** The deliberate opt-in, documented as writing a credential to stdout. */
  test("--show-token includes it, and is the only path that does", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true, showToken: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).token).toBe(SENTINEL);
  });

  /**
   * `console.table` writes to stdout, which is reserved for machine-readable
   * output. Asserted with the real one in place — mocking it hides the leak.
   */
  test("the human view writes nothing to stdout", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", {} as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("last_run: never renders as never", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).last_run).toBe("never");
  });

  /**
   * Probed: `info` returns `timeout`, `secrets` and `console`, none of them in
   * `AnalysisCreateInfo`. `--raw` is the documented escape hatch, so it must not
   * drop them.
   */
  test("--raw passes through fields the SDK type does not declare", async () => {
    const { analysisInfo } = await import("./analysis-info.js");
    await analysisInfo("ana1", { json: true, raw: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toHaveProperty("timeout");
    expect(parsed).toHaveProperty("secrets");
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.analysis.info.mockRejectedValue(new Error("Analysis can't be found"));

    const { analysisInfo } = await import("./analysis-info.js");
    await expect(analysisInfo("nope", {} as never)).rejects.toThrow(/not_found/);
  });

  test("an unknown id routes through the JSON channel when --json is set", async () => {
    resourcesInstance.analysis.info.mockRejectedValue(new Error("Analysis can't be found"));

    const { analysisInfo } = await import("./analysis-info.js");
    await expect(analysisInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
