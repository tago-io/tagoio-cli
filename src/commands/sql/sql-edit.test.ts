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
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-sql-id-from-tagoio.js", () => ({
  pickSQLIDFromTagoIO: pickSQLIDMock,
}));

const STORED_QUERY = "SELECT d.id FROM devices() AS d";

describe("sqlEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickSQLIDMock.mockReset().mockResolvedValue("sql1");
    resourcesInstance.sql.info.mockResolvedValue({
      id: "sql1",
      name: "stored_name",
      query: STORED_QUERY,
      description: "stored description",
      params: [{ key: "$1", value: "stored" }],
      cache_enabled: true,
      cache_ttl_seconds: 3600,
      rate_limit_rpm: 30,
      active: true,
      version: 4,
      tags: [{ key: "env", value: "prod" }],
    });
    resourcesInstance.sql.edit.mockResolvedValue({ id: "sql1", name: "stored_name", version: 5 });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit("sql1", { name: "new", param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  /**
   * The headline assertion. Probed: `edit(id, { name })` fails with
   * `Invalid JSON: missing field query` — the API is a full PUT, and the SDK type
   * says `SQLCreateInfo` rather than `Partial<…>` because it means it. So the
   * command reads the record first and merges, or a rename would wipe the SQL.
   */
  test("--name alone still sends the stored query", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { name: "renamed", param: [], tagkey: [], tagvalue: [] } as never);

    const payload = resourcesInstance.sql.edit.mock.calls[0][1];
    expect(payload.name).toBe("renamed");
    expect(payload.query).toBe(STORED_QUERY);
  });

  test("every unspecified field survives from the stored record", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { name: "renamed", param: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.edit.mock.calls[0][1]).toMatchObject({
      description: "stored description",
      cache_enabled: true,
      cache_ttl_seconds: 3600,
      rate_limit_rpm: 30,
      active: true,
      params: [{ key: "$1", value: "stored" }],
    });
  });

  test("--query overrides the stored one rather than appending", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", {
      query: "SELECT d.name FROM devices() AS d",
      param: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.sql.edit.mock.calls[0][1].query).toBe("SELECT d.name FROM devices() AS d");
  });

  /** Params replace as a set; merging per key would make a removal impossible. */
  test("--param replaces the whole param set", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { param: ["$1=fresh"], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.edit.mock.calls[0][1].params).toEqual([{ key: "$1", value: "fresh" }]);
  });

  test("--activate and --deactivate flip active", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { deactivate: true, param: [], tagkey: [], tagvalue: [] } as never);
    expect(resourcesInstance.sql.edit.mock.calls[0][1].active).toBe(false);

    await sqlEdit("sql1", { activate: true, param: [], tagkey: [], tagvalue: [] } as never);
    expect(resourcesInstance.sql.edit.mock.calls[1][1].active).toBe(true);
  });

  test("--activate and --deactivate together fail before any call", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit("sql1", { activate: true, deactivate: true, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.sql.info).not.toHaveBeenCalled();
    expect(resourcesInstance.sql.edit).not.toHaveBeenCalled();
  });

  test("--merge-tags preserves tags absent from the command line", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { mergeTags: true, param: [], tagkey: ["extra"], tagvalue: ["yes"] } as never);

    expect(resourcesInstance.sql.edit.mock.calls[0][1].tags).toEqual([
      { key: "env", value: "prod" },
      { key: "extra", value: "yes" },
    ]);
  });

  test("without --merge-tags the tag set is replaced", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { param: [], tagkey: ["only"], tagvalue: ["this"] } as never);

    expect(resourcesInstance.sql.edit.mock.calls[0][1].tags).toEqual([{ key: "only", value: "this" }]);
  });

  /** A no-op must not pay for the read the PUT merge would otherwise need. */
  test("an empty patch fails without reading or writing", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit("sql1", { param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.sql.info).not.toHaveBeenCalled();
    expect(resourcesInstance.sql.edit).not.toHaveBeenCalled();
  });

  /**
   * Probed: the version advances when the SQL changes — 1 → 2 → 3 across two
   * query edits — and stays put for a metadata-only edit. Either way the number
   * reported comes from the response rather than being assumed.
   */
  test("--json reports the new version from the response", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await sqlEdit("sql1", { name: "renamed", json: true, param: [], tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "sql1", version: 5 });
  });

  /** A partial PUT would blank the query, so a failed read must stop the write. */
  test("a failing read aborts rather than sending a partial PUT", async () => {
    resourcesInstance.sql.info.mockRejectedValue(new Error("not found"));

    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit("sql1", { name: "renamed", param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/not_found/);

    expect(resourcesInstance.sql.edit).not.toHaveBeenCalled();
  });

  test("an empty --query fails offline", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit("sql1", { query: "   ", param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/empty_query/);

    expect(resourcesInstance.sql.edit).not.toHaveBeenCalled();
  });

  test("--silent without an id fails and never prompts", async () => {
    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit(undefined, { name: "new", silent: true, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/missing_input/);

    expect(pickSQLIDMock).not.toHaveBeenCalled();
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.edit.mockRejectedValue(new Error("boom"));

    const { sqlEdit } = await import("./sql-edit.js");
    await expect(sqlEdit("sql1", { name: "renamed", json: true, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:edit_failed:/);
  });
});
