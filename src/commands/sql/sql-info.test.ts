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

vi.mock("../../prompt/pick-sql-id-from-tagoio.js", () => ({
  pickSQLIDFromTagoIO: pickSQLIDMock,
}));

describe("sqlInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const info = {
    id: "sql1",
    name: "freezer_temp_summary",
    description: "Aggregates freezer readings",
    query: "SELECT MIN(a.time) AS period_start\nFROM device($1) AS a",
    params: [
      { key: "$1", value: "dev1" },
      { key: "$2", value: "2026-07-06" },
    ],
    cache_enabled: false,
    cache_ttl_seconds: 0,
    rate_limit_rpm: null,
    active: true,
    session_context: false,
    version: 9,
    tags: [{ key: "env", value: "prod" }],
    created_at: new Date("2026-08-06T14:42:52.390Z"),
    updated_at: new Date("2026-08-06T15:00:00.000Z"),
    // Probed as returned but absent from SQLInfo.
    cache_version: 10,
    profile: "prof1",
    versions: {
      "1": { created_at: "2026-08-06T14:42:52Z", created_by: "usr1", version_id: "v1" },
      "9": { created_at: "2026-08-06T15:00:00Z", created_by: "usr1", version_id: "v9" },
    },
  };

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickSQLIDMock.mockReset().mockResolvedValue("sql1");
    resourcesInstance.sql.info.mockResolvedValue(info);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlInfo } = await import("./sql-info.js");
    await expect(sqlInfo("sql1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches the query by the given id", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", {} as never);

    expect(resourcesInstance.sql.info).toHaveBeenCalledWith("sql1");
  });

  test("prompts for the query when the id is omitted", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo(undefined, {} as never);

    expect(pickSQLIDMock).toHaveBeenCalled();
    expect(resourcesInstance.sql.info).toHaveBeenCalledWith("sql1");
  });

  test("--silent without an id fails and never prompts", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await expect(sqlInfo(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickSQLIDMock).not.toHaveBeenCalled();
  });

  test("--json carries the query text and params", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", { json: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.query).toBe(info.query);
    expect(parsed.params).toEqual(info.params);
  });

  test("--json carries the live version and session_context", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", { json: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.version).toBe(9);
    expect(parsed.session_context).toBe(false);
  });

  /**
   * `console.table` writes to stdout, which is reserved for machine-readable
   * output. Asserted with the real one in place.
   */
  test("the human view writes nothing to stdout", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", {} as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("a Date created_at renders without throwing", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).created_at).toBeTruthy();
  });

  test("--raw keeps the dates in ISO form", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", { json: true, raw: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).created_at).toBe("2026-08-06T14:42:52.390Z");
  });

  /**
   * Probed: `info` returns `cache_version`, `profile` and a `versions` map, none
   * of them in `SQLInfo`. `--raw` is the documented escape hatch, so it must not
   * drop them.
   */
  test("--raw passes through fields the SDK type does not declare", async () => {
    const { sqlInfo } = await import("./sql-info.js");
    await sqlInfo("sql1", { json: true, raw: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed).toHaveProperty("cache_version");
    expect(parsed).toHaveProperty("versions");
  });

  /** The version count comes from the untyped map, so it needs its own helper. */
  test("countVersions reads the untyped versions map", async () => {
    const { countVersions } = await import("./sql-info.js");

    expect(countVersions(info as never)).toBe(2);
  });

  test("countVersions falls back to zero when the map is absent", async () => {
    const { countVersions } = await import("./sql-info.js");

    expect(countVersions({ id: "x" } as never)).toBe(0);
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.sql.info.mockRejectedValue(new Error("not found"));

    const { sqlInfo } = await import("./sql-info.js");
    await expect(sqlInfo("nope", {} as never)).rejects.toThrow(/not_found/);
  });

  test("an unknown id routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.info.mockRejectedValue(new Error("not found"));

    const { sqlInfo } = await import("./sql-info.js");
    await expect(sqlInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
