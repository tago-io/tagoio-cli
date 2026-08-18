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

/** Mirrors the real requireOrFail, including that it prompts when absent. */
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

const QUERY = "SELECT d.id, d.name FROM devices() AS d";

describe("sqlCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    // create resolves the full SQLInfo, not an id wrapper.
    resourcesInstance.sql.create.mockResolvedValue({
      id: "sql1",
      name: "my_query",
      query: QUERY,
      version: 1,
      active: true,
      cache_enabled: false,
      cache_ttl_seconds: 0,
      rate_limit_rpm: null,
    });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("q", { query: QUERY, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("sends the name and query", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", { query: QUERY, param: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0]).toMatchObject({ name: "my_query", query: QUERY });
  });

  /**
   * `create` resolves the whole `SQLInfo`, and the response is the only honest
   * source: probed, `cache_ttl_seconds` clamps silently (99999 → 86400, −1 → 0),
   * so echoing the request would report a value the server never stored.
   */
  test("--json reports the id and version from the response", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", { query: QUERY, json: true, param: [], tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "sql1", version: 1 });
  });

  test("--json reports the stored cache settings, not the requested ones", async () => {
    resourcesInstance.sql.create.mockResolvedValue({
      id: "sql1",
      name: "my_query",
      version: 1,
      active: true,
      cache_enabled: true,
      // The server clamped 99999 down to the 24h maximum.
      cache_ttl_seconds: 86400,
      rate_limit_rpm: null,
    });

    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", {
      query: QUERY,
      cache: true,
      cacheTtl: 99999,
      json: true,
      param: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.cache_ttl_seconds).toBe(86400);
  });

  test("--cache-ttl is forwarded as given, since the clamp is the API's business", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", {
      query: QUERY,
      cacheTtl: 99999,
      param: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0].cache_ttl_seconds).toBe(99999);
  });

  test("missing --query fails offline naming the flag, before any call", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("my_query", { param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/--query/);

    expect(resourcesInstance.sql.create).not.toHaveBeenCalled();
  });

  test("an empty --query fails offline", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("my_query", { query: "  ", param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/empty_query/);

    expect(resourcesInstance.sql.create).not.toHaveBeenCalled();
  });

  test("--param pairs reach the payload as positional params", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", {
      query: QUERY,
      param: ["$1=dev1", "$2=2026-07-06"],
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0].params).toEqual([
      { key: "$1", value: "dev1" },
      { key: "$2", value: "2026-07-06" },
    ]);
  });

  /** No --param must omit the key so the query keeps whatever defaults it had. */
  test("no --param omits the params key entirely", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", { query: QUERY, param: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0]).not.toHaveProperty("params");
  });

  test("a malformed --param fails offline", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("my_query", { query: QUERY, param: ["foo=bar"], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_param/);

    expect(resourcesInstance.sql.create).not.toHaveBeenCalled();
  });

  test("--inactive creates a disabled query", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", { query: QUERY, inactive: true, param: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0].active).toBe(false);
  });

  test("--cache enables the result cache", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", { query: QUERY, cache: true, param: [], tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0].cache_enabled).toBe(true);
  });

  test("--description and --rate-limit reach the payload", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", {
      query: QUERY,
      description: "does things",
      rateLimit: 30,
      param: [],
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0]).toMatchObject({
      description: "does things",
      rate_limit_rpm: 30,
    });
  });

  test("tags reach the payload", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await sqlCreate("my_query", { query: QUERY, param: [], tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.sql.create.mock.calls[0][0].tags).toEqual([{ key: "env", value: "prod" }]);
  });

  /**
   * The API is the SQL parser, and its rejections name the rule broken. A local
   * check would go stale as the dialect grows.
   */
  test("invalid SQL is forwarded and the API's message is surfaced", async () => {
    resourcesInstance.sql.create.mockRejectedValue(new Error("Only SELECT statements are allowed"));

    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("my_query", { query: "INSERT INTO device VALUES (1)", param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(
      /Only SELECT statements are allowed/,
    );

    expect(resourcesInstance.sql.create.mock.calls[0][0].query).toBe("INSERT INTO device VALUES (1)");
  });

  test("a plan-cap rejection surfaces the API's own limit", async () => {
    resourcesInstance.sql.create.mockRejectedValue(new Error("You have exceeded the maximum limit of SQL Query Rate Limit (120)"));

    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("my_query", { query: QUERY, rateLimit: 999999, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(
      /Rate Limit \(120\)/,
    );
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.create.mockRejectedValue(new Error("boom"));

    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate("my_query", { query: QUERY, json: true, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:create_failed:/);
  });

  test("--silent without a name fails before any API call", async () => {
    const { sqlCreate } = await import("./sql-create.js");
    await expect(sqlCreate(undefined, { query: QUERY, silent: true, param: [], tagkey: [], tagvalue: [] } as never)).rejects.toThrow(
      /Missing required input: name/,
    );

    expect(resourcesInstance.sql.create).not.toHaveBeenCalled();
  });
});
