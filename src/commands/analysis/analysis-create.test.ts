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

/**
 * Mirrors the real `requireOrFail`, including that it *prompts* when the value
 * is absent. A mock that skipped the prompt would leave `prompts.inject`
 * entries unconsumed and shift every later answer onto the wrong question —
 * that cost six failures in #46.
 */
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string, opts: { silent?: boolean; json?: boolean } = {}) => {
  if (value) {
    return value;
  }
  if (opts.silent) {
    const message = `Missing required input: ${name}`;
    if (opts.json) {
      errorHandlerJSONMock(message, "missing_input");
    }
    errorHandlerMock(message);
  }
  const { input } = await prompts({ type: "text", name: "input", message: `Enter ${name}:` });
  if (!input) {
    errorHandlerMock(`Missing required input: ${name}`);
  }
  return input as string;
});

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
  requireOrFail: requireOrFailMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

/** Recognisable string proving the analysis token never reaches a stream. */
const SENTINEL = "SENTINEL_TOKEN_12345";

describe("analysisCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    // Probed: `run_on: tago` (the default) yields an empty token; only external
    // gets a real one.
    resourcesInstance.analysis.create.mockResolvedValue({ id: "ana1", token: "" });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("sends the name", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].name).toBe("My Analysis");
  });

  test("--json reports the id from response.id", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { json: true, var: [], tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({
      id: "ana1",
      name: "My Analysis",
      run_on: "tago",
      active: true,
    });
  });

  /**
   * `create` resolves `{ id, token }`, but probing showed the token is `""`
   * whenever `run_on` is `tago` — the default. Printing an empty field invites a
   * bug report; printing a real one puts a credential in CI logs. So the shape
   * reports presence instead.
   */
  test("--json reports token_present rather than the token", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { json: true, var: [], tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.token_present).toBe(false);
    expect(parsed).not.toHaveProperty("token");
  });

  test("token_present is true when the API returns one", async () => {
    resourcesInstance.analysis.create.mockResolvedValue({ id: "ana1", token: SENTINEL });

    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", {
      runOn: "external",
      json: true,
      var: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.token_present).toBe(true);
    expect(parsed).not.toHaveProperty("token");
  });

  test("the token reaches neither stream when the API returns one", async () => {
    resourcesInstance.analysis.create.mockResolvedValue({ id: "ana1", token: SENTINEL });

    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { runOn: "external", var: [], tagkey: [], tagvalue: [] } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("the token reaches neither stream in --json mode", async () => {
    resourcesInstance.analysis.create.mockResolvedValue({ id: "ana1", token: SENTINEL });

    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", {
      runOn: "external",
      json: true,
      var: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  /** Probed: the API rejects `String must contain at least 1 character(s)`. */
  test("an empty name fails before any API call", async () => {
    prompts.inject([""]);

    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate(undefined, { var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow();

    expect(resourcesInstance.analysis.create).not.toHaveBeenCalled();
  });

  /**
   * The API defaults to `node-legacy`. Inheriting that silently would put every
   * new analysis on the legacy runtime, so the CLI picks the current one and
   * says so in --help.
   */
  test("the runtime defaults to node-rt2025, not the API's node-legacy", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].runtime).toBe("node-rt2025");
  });

  test("--runtime overrides the default", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { runtime: "python-rt2025", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].runtime).toBe("python-rt2025");
  });

  /**
   * Probed: the API accepts eight runtimes, not the five `SnippetRuntime` lists.
   * Its rejection message names all of them, so the offline check is about
   * failing before the round trip rather than about a better message.
   */
  test("an invalid runtime fails offline, naming the valid values", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate("My Analysis", { runtime: "bogus", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_runtime/);
    await expect(analysisCreate("My Analysis", { runtime: "bogus", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/deno-rt2025/);

    expect(resourcesInstance.analysis.create).not.toHaveBeenCalled();
  });

  test("all eight probed runtimes are accepted", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    const runtimes = ["node", "python", "node-legacy", "python-legacy", "deno-rt2025", "node-rt2025", "python-rt2025", "other"];

    for (const runtime of runtimes) {
      await analysisCreate("My Analysis", { runtime, var: [], tagkey: [], tagvalue: [] } as never);
    }

    expect(resourcesInstance.analysis.create).toHaveBeenCalledTimes(runtimes.length);
  });

  test("run_on defaults to tago, matching the API", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].run_on).toBe("tago");
  });

  test("--run-on external reaches the payload", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { runOn: "external", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].run_on).toBe("external");
  });

  test("an invalid --run-on fails offline", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate("My Analysis", { runOn: "moon", var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_run_on/);

    expect(resourcesInstance.analysis.create).not.toHaveBeenCalled();
  });

  /** The type declares `active?: true`; probing showed false works. */
  test("--inactive creates a deactivated analysis", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { inactive: true, var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].active).toBe(false);
  });

  test("--description reaches the payload", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { description: "Does things", var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].description).toBe("Does things");
  });

  /** The API needs an array of string-valued pairs, not the declared object. */
  test("--var pairs reach the payload as an array of strings", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: ["A=1", "B=2"], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].variables).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
  });

  /** An empty array would wipe variables; the key must be absent instead. */
  test("no --var omits the variables key entirely", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0]).not.toHaveProperty("variables");
  });

  test("a malformed --var fails offline", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate("My Analysis", { var: ["NOEQUALS"], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_variable/);

    expect(resourcesInstance.analysis.create).not.toHaveBeenCalled();
  });

  test("tags reach the payload", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: [], tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.analysis.create.mock.calls[0][0].tags).toEqual([{ key: "env", value: "prod" }]);
  });

  /**
   * Probed: two analyses with the same name both created successfully. Unlike
   * secrets and run users, duplicates are legitimate here, so pre-checking
   * would break a real workflow.
   */
  test("a duplicate name is not pre-checked", async () => {
    const { analysisCreate } = await import("./analysis-create.js");
    await analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list).not.toHaveBeenCalled();
  });

  test("an API rejection reports create_failed", async () => {
    resourcesInstance.analysis.create.mockRejectedValue(new Error("boom"));

    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate("My Analysis", { var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/create_failed|boom/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.analysis.create.mockRejectedValue(new Error("boom"));

    const { analysisCreate } = await import("./analysis-create.js");
    await expect(analysisCreate("My Analysis", { json: true, var: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:create_failed:/);
  });
});
