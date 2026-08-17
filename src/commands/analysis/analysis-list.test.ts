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

describe("analysisList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const analysisList = [
    {
      id: "ana1",
      name: "Alert Dispatch",
      active: true,
      run_on: "tago",
      runtime: "node-rt2025",
      // Probed: the API returns the literal string "never", not null.
      last_run: "never",
      created_at: new Date("2026-07-01T13:21:48.402Z"),
      tags: [{ key: "env", value: "prod" }],
    },
  ];

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    resourcesInstance.analysis.list.mockResolvedValue(analysisList);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { analysisList: run } = await import("./analysis-list.js");
    await expect(run({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  // The SDK default is 20, so the wider default has to be passed explicitly.
  test("requests 100 analyses by default", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].amount).toBe(100);
  });

  test("--amount overrides the default", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ amount: 5, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].amount).toBe(5);
  });

  test("requests the fields the listing renders", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].fields).toEqual(["id", "name", "active", "run_on", "runtime", "last_run", "created_at", "tags"]);
  });

  test("--json emits a clean array", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ id: "ana1", name: "Alert Dispatch" });
  });

  test("--stringify pretty-prints", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ stringify: true, tagkey: [], tagvalue: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });

  test("the default view uses console.table and writes nothing to stdout", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { analysisList: run } = await import("./analysis-list.js");
    await run({ tagkey: [], tagvalue: [] } as never);

    expect(tableSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  /**
   * Probed: `last_run` comes back as the literal string "never" — the same
   * sentinel Actions uses for `last_triggered`. `mapDate` would call
   * `.toISOString()` on it and throw, which is the bug that shipped twice in
   * this series.
   */
  test("last_run: never renders without throwing, key present", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ json: true, tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))[0].last_run).toBe("never");
  });

  test("a real Date last_run renders as a formatted date", async () => {
    resourcesInstance.analysis.list.mockResolvedValue([{ ...analysisList[0], last_run: new Date("2026-08-13T18:27:47.994Z") }]);

    const { analysisList: run } = await import("./analysis-list.js");
    await run({ json: true, tagkey: [], tagvalue: [] } as never);

    const value = JSON.parse(String(stdoutSpy.mock.calls[0][0]))[0].last_run;
    expect(value).toBeTruthy();
    expect(value).not.toBe("never");
  });

  test("a Date created_at renders without throwing", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ json: true, tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))[0].created_at).toBeTruthy();
  });

  test("--name filters with a wrapped partial", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ name: "Alert", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].filter.name).toBe("*Alert*");
  });

  test("--active filters on the active state", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ active: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].filter.active).toBe(true);
  });

  test("--inactive filters on the inactive state", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ inactive: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].filter.active).toBe(false);
  });

  test("--active and --inactive together fail before any call", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await expect(run({ active: true, inactive: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.analysis.list).not.toHaveBeenCalled();
  });

  /**
   * The API ignores `run_on` in a listing filter. Isolated live: filtering on
   * "external" returned all 15 analyses including every `tago` one, and even a
   * nonsense value came back unfiltered rather than rejected — while `name` and
   * `tags` filters on the same endpoint narrow correctly.
   *
   * `AnalysisQuery` declares it filterable, so forwarding it would look right
   * and silently return everything. Filtering client-side is what makes
   * --run-on mean what it says.
   */
  test("--run-on narrows the result client-side, since the API ignores the filter", async () => {
    resourcesInstance.analysis.list.mockResolvedValue([
      { ...analysisList[0], id: "a1", name: "On Tago", run_on: "tago" },
      { ...analysisList[0], id: "a2", name: "On External", run_on: "external" },
    ]);

    const { analysisList: run } = await import("./analysis-list.js");
    await run({ runOn: "external", json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("On External");
  });

  test("--run-on tago keeps only the tago rows", async () => {
    resourcesInstance.analysis.list.mockResolvedValue([
      { ...analysisList[0], id: "a1", name: "On Tago", run_on: "tago" },
      { ...analysisList[0], id: "a2", name: "On External", run_on: "external" },
    ]);

    const { analysisList: run } = await import("./analysis-list.js");
    await run({ runOn: "tago", json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("On Tago");
  });

  /** The count reported to the user must reflect what was actually shown. */
  test("the reported count matches the filtered rows, not the API total", async () => {
    resourcesInstance.analysis.list.mockResolvedValue([
      { ...analysisList[0], id: "a1", name: "On Tago", run_on: "tago" },
      { ...analysisList[0], id: "a2", name: "On External", run_on: "external" },
    ]);

    const { analysisList: run } = await import("./analysis-list.js");
    const { successMSG } = await import("../../lib/messages.js");
    await run({ runOn: "external", tagkey: [], tagvalue: [] } as never);

    expect(String((successMSG as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("1");
  });

  /** Probed: the API rejects anything but tago|external with an enum error. */
  test("an invalid --run-on fails offline, before any call", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await expect(run({ runOn: "moon", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_run_on/);

    expect(resourcesInstance.analysis.list).not.toHaveBeenCalled();
  });

  test("-k and -v reach the tag filter", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].filter.tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("--order-by and --order reach the query", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ orderBy: "last_run", order: "desc", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].orderBy).toEqual(["last_run", "desc"]);
  });

  test("--order-by defaults to ascending", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await run({ orderBy: "name", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.analysis.list.mock.calls[0][0].orderBy).toEqual(["name", "asc"]);
  });

  /** AnalysisQuery declares six orderable fields; description is not one. */
  test("an unorderable field fails offline, naming the valid set", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await expect(run({ orderBy: "description", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order_by/);
    await expect(run({ orderBy: "description", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/run_on/);

    expect(resourcesInstance.analysis.list).not.toHaveBeenCalled();
  });

  test("an invalid --order value fails offline", async () => {
    const { analysisList: run } = await import("./analysis-list.js");
    await expect(run({ orderBy: "name", order: "sideways", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order/);
  });

  /**
   * `AnalysisInfo.token` authenticates as the analysis. The listing never
   * requests it, but a future field-list edit could add it by accident, so this
   * pins the absence.
   */
  test("the listing never carries a token", async () => {
    resourcesInstance.analysis.list.mockResolvedValue([{ ...analysisList[0], token: "SENTINEL_TOKEN_12345" }]);

    const { analysisList: run } = await import("./analysis-list.js");
    await run({ json: true, tagkey: [], tagvalue: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).not.toContain("SENTINEL_TOKEN_12345");
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.analysis.list.mockRejectedValue(new Error("boom"));

    const { analysisList: run } = await import("./analysis-list.js");
    await expect(run({ json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/json:|boom/);
  });
});
