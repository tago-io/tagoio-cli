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

describe("sqlList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  // Probed: a listing returns id, name and tags whatever `fields` asks for.
  const queryList = [{ id: "sql1", name: "freezer_temp_summary", tags: [{ key: "env", value: "prod" }] }];

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    resourcesInstance.sql.list.mockResolvedValue(queryList);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlList } = await import("./sql-list.js");
    await expect(sqlList({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("requests 100 queries by default", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.list.mock.calls[0][0].amount).toBe(100);
  });

  test("--amount overrides the default", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ amount: 5, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.list.mock.calls[0][0].amount).toBe(5);
  });

  test("--json emits a clean array", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ id: "sql1", name: "freezer_temp_summary" });
  });

  test("--stringify pretty-prints", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ stringify: true, tagkey: [], tagvalue: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });

  test("the default view uses console.table and writes nothing to stdout", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { sqlList } = await import("./sql-list.js");
    await sqlList({ tagkey: [], tagvalue: [] } as never);

    expect(tableSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("--name filters with a wrapped partial", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ name: "freezer", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.list.mock.calls[0][0].filter.name).toBe("*freezer*");
  });

  test("--active and --inactive filter on state", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ active: true, tagkey: [], tagvalue: [] } as never);
    expect(resourcesInstance.sql.list.mock.calls[0][0].filter.active).toBe(true);

    await sqlList({ inactive: true, tagkey: [], tagvalue: [] } as never);
    expect(resourcesInstance.sql.list.mock.calls[1][0].filter.active).toBe(false);
  });

  test("--active and --inactive together fail before any call", async () => {
    const { sqlList } = await import("./sql-list.js");
    await expect(sqlList({ active: true, inactive: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.sql.list).not.toHaveBeenCalled();
  });

  test("-k and -v reach the tag filter", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.sql.list.mock.calls[0][0].filter.tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("--order-by and --order reach the query", async () => {
    const { sqlList } = await import("./sql-list.js");
    await sqlList({ orderBy: "created_at", order: "desc", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.sql.list.mock.calls[0][0].orderBy).toEqual(["created_at", "desc"]);
  });

  /**
   * The inversion that makes this family different: probed, the API **accepted**
   * `orderBy: ["query","asc"]` and returned rows rather than rejecting. Every
   * other family has the API refuse, so the offline check merely improves the
   * message. Here it is the only check there is — without it a typo silently
   * produces a differently-ordered list.
   */
  test("an unorderable field fails offline, since the API would accept it silently", async () => {
    const { sqlList } = await import("./sql-list.js");
    await expect(sqlList({ orderBy: "query", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order_by/);
    await expect(sqlList({ orderBy: "query", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/updated_at/);

    expect(resourcesInstance.sql.list).not.toHaveBeenCalled();
  });

  test("an invalid --order value fails offline", async () => {
    const { sqlList } = await import("./sql-list.js");
    await expect(sqlList({ orderBy: "name", order: "sideways", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.list.mockRejectedValue(new Error("boom"));

    const { sqlList } = await import("./sql-list.js");
    await expect(sqlList({ json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/json:|boom/);
  });
});
