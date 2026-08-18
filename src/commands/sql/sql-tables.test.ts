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
const writeStatusMock = vi.fn();
const infoMSGMock = vi.fn();

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
  infoMSG: infoMSGMock,
  successMSG: vi.fn(),
}));

/** Mirrors the live shape: 5 tables, mixed function kinds, an empty entity. */
const TABLES = {
  tables: [
    { function: "device", label: "Device Data", tag_form: "device_tag", columns: [{ name: "time", type: "timestamp" }] },
    // Probed: zero columns until entity_id is supplied.
    { function: "entity", label: "Entity Data", tag_form: "entity_tag", columns: [] },
    { function: "devices", label: "Devices", columns: [{ name: "id", type: "string" }] },
  ],
  resources: {
    devices: [{ id: "dev1", name: "Freezer A" }],
    entities: [{ id: "ent1", name: "test" }],
  },
  functions: [
    { name: "count", kind: "aggregate", args: ["column"], description: "Counts rows" },
    { name: "has_tag", kind: "predicate", args: ["key", "value"], description: "Matches a tag", example: "has_tag('key', 'value')" },
    {
      name: "session_user_id",
      kind: "session",
      args: [],
      description: "Current run user",
      example: "COALESCE(session_user_id(), '...')",
    },
  ],
};

describe("sqlTables", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    writeStatusMock.mockClear();
    infoMSGMock.mockClear();
    resourcesInstance.sql.tables.mockResolvedValue(TABLES);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlTables } = await import("./sql-tables.js");
    await expect(sqlTables({} as never)).rejects.toThrow(/Environment not found/);
  });

  test("the human view writes nothing to stdout", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({} as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("--json carries the tables, resources and functions", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({ json: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.tables).toHaveLength(3);
    expect(parsed.resources.devices).toHaveLength(1);
    expect(parsed.functions).toHaveLength(3);
  });

  test("the human view lists each table with its column count", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({} as never);

    const written = writeStatusMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(written).toMatch(/device/);
    expect(written).toMatch(/devices/);
  });

  /**
   * Probed: the `entity` table has zero columns until `entity_id` is supplied,
   * then resolves six. An empty list with no explanation reads as a broken
   * table, so the renderer has to say why.
   */
  test("the entity table with no columns explains that --entity resolves them", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({} as never);

    const written = writeStatusMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(written).toMatch(/--entity/);
  });

  test("functions are grouped by kind", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({} as never);

    const headings = infoMSGMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(headings).toMatch(/aggregate/i);
    expect(headings).toMatch(/session/i);
  });

  /** A session function's example carries the COALESCE idiom worth copying. */
  test("a session function's example is shown", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({} as never);

    const written = writeStatusMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(written).toMatch(/COALESCE/);
  });

  test("the human view lists devices and entities with their ids", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({} as never);

    const written = writeStatusMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(written).toMatch(/Freezer A/);
    expect(written).toMatch(/dev1/);
  });

  test("--entity reaches the query as entity_id", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({ entity: "ent1" } as never);

    expect(resourcesInstance.sql.tables.mock.calls[0][0].entity_id).toBe("ent1");
  });

  test("--filter, --amount and --page reach the query", async () => {
    const { sqlTables } = await import("./sql-tables.js");
    await sqlTables({ filter: "Freezer", amount: 5, page: 2 } as never);

    expect(resourcesInstance.sql.tables.mock.calls[0][0]).toMatchObject({
      filter: "Freezer",
      amount: 5,
      page: 2,
    });
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.tables.mockRejectedValue(new Error("boom"));

    const { sqlTables } = await import("./sql-tables.js");
    await expect(sqlTables({ json: true } as never)).rejects.toThrow(/json:|boom/);
  });
});
