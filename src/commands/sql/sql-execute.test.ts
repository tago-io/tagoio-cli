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
const pickSQLIDMock = vi.fn();
const writeStatusMock = vi.fn();

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
  writeStatus: writeStatusMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-sql-id-from-tagoio.js", () => ({
  pickSQLIDFromTagoIO: pickSQLIDMock,
}));

/** Query order and alphabetical order disagree, so a reorder would be visible. */
const RESULT = {
  columns: [
    { name: "period_start", type: "timestamp" },
    { name: "period_end", type: "timestamp" },
    { name: "temperature_min_f", type: "number" },
    { name: "temperature_max_f", type: "number" },
  ],
  rows: [{ period_start: "a", period_end: "b", temperature_min_f: 5, temperature_max_f: 11 }],
  row_count: 1,
  execution_ms: 383,
  served_from_cache: false,
};

describe("sqlExecute", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let tableSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    writeStatusMock.mockClear();
    pickSQLIDMock.mockReset().mockResolvedValue("sql1");
    resourcesInstance.sql.execute.mockResolvedValue(RESULT);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlExecute } = await import("./sql-execute.js");
    await expect(sqlExecute("sql1", { param: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("executes the query by the given id", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    expect(resourcesInstance.sql.execute).toHaveBeenCalledWith("sql1", {});
  });

  test("prompts for the query when the id is omitted", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute(undefined, { param: [] } as never);

    expect(pickSQLIDMock).toHaveBeenCalled();
    expect(resourcesInstance.sql.execute).toHaveBeenCalledWith("sql1", {});
  });

  test("--silent without an id fails and never prompts", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await expect(sqlExecute(undefined, { silent: true, param: [] } as never)).rejects.toThrow(/missing_input/);

    expect(pickSQLIDMock).not.toHaveBeenCalled();
  });

  /**
   * `console.table` sorts keys alphabetically, which on a result set is a
   * correctness bug rather than a cosmetic one. The rows go through the renderer
   * that respects `columns[]`.
   */
  test("rows render in query order, not alphabetical", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    const printed = tableSpy.mock.calls[0][0] as Record<string, unknown>[];
    expect(Object.keys(printed[0])).toEqual(["period_start", "period_end", "temperature_min_f", "temperature_max_f"]);
  });

  /**
   * The sharpest stdout/stderr split in the CLI: the rows are the data, the
   * timing is metadata about fetching them.
   */
  test("human mode writes the footer to stderr, never stdout", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    expect(writeStatusMock).toHaveBeenCalled();
    expect(String(writeStatusMock.mock.calls.at(-1)?.[0])).toMatch(/383/);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("the footer names the row count and the cache state", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    const footer = String(writeStatusMock.mock.calls.at(-1)?.[0]);
    expect(footer).toMatch(/1 row\b/);
    expect(footer).toMatch(/not cached/i);
  });

  test("a cached result says so", async () => {
    resourcesInstance.sql.execute.mockResolvedValue({ ...RESULT, served_from_cache: true });

    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    expect(String(writeStatusMock.mock.calls.at(-1)?.[0])).toMatch(/from cache/i);
  });

  test("--json emits the whole result on stdout", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { json: true, param: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toMatchObject({ row_count: 1, execution_ms: 383, served_from_cache: false });
    expect(parsed.columns).toHaveLength(4);
    expect(parsed.rows).toHaveLength(1);
  });

  test("--json keeps the rows unprojected, so a consumer sees the raw values", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { json: true, param: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).rows[0].temperature_min_f).toBe(5);
  });

  /** Zero rows is an answer, not a failure. */
  test("zero rows reports the columns rather than looking like a failure", async () => {
    resourcesInstance.sql.execute.mockResolvedValue({ ...RESULT, rows: [], row_count: 0 });

    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    const written = writeStatusMock.mock.calls.map((call) => String(call[0])).join(" ");
    expect(written).toMatch(/period_start/);
    expect(written).toMatch(/0 rows/);
    expect(errorHandlerMock).not.toHaveBeenCalled();
  });

  test("--param overrides a saved default", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: ["$1=%Freezer%"] } as never);

    expect(resourcesInstance.sql.execute.mock.calls[0][1].params).toEqual([{ key: "$1", value: "%Freezer%" }]);
  });

  /** Probed: with no params the query's saved defaults apply. */
  test("no --param omits the key so the saved defaults apply", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { param: [] } as never);

    expect(resourcesInstance.sql.execute.mock.calls[0][1]).not.toHaveProperty("params");
  });

  test("a malformed --param fails offline", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await expect(sqlExecute("sql1", { param: ["foo=bar"] } as never)).rejects.toThrow(/invalid_param/);

    expect(resourcesInstance.sql.execute).not.toHaveBeenCalled();
  });

  test("--test skips the cache entirely", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { test: true, param: [] } as never);

    expect(resourcesInstance.sql.execute.mock.calls[0][1].test).toBe(true);
  });

  test("--after-device sends the pagination cursor", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { afterDevice: "dev9", param: [] } as never);

    expect(resourcesInstance.sql.execute.mock.calls[0][1].after_device).toBe("dev9");
  });

  /** Probed: `--inactive` blocks execution, not merely visibility. */
  test("an inactive query surfaces the API's message", async () => {
    resourcesInstance.sql.execute.mockRejectedValue(new Error("SQL query is inactive"));

    const { sqlExecute } = await import("./sql-execute.js");
    await expect(sqlExecute("sql1", { param: [] } as never)).rejects.toThrow(/SQL query is inactive/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.execute.mockRejectedValue(new Error("boom"));

    const { sqlExecute } = await import("./sql-execute.js");
    await expect(sqlExecute("sql1", { json: true, param: [] } as never)).rejects.toThrow(/^json:execute_failed:/);
  });

  test("--stringify pretty-prints the result", async () => {
    const { sqlExecute } = await import("./sql-execute.js");
    await sqlExecute("sql1", { stringify: true, param: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });
});
