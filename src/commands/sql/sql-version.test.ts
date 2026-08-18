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
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-sql-id-from-tagoio.js", () => ({
  pickSQLIDFromTagoIO: pickSQLIDMock,
}));

describe("sqlVersion", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const version = {
    query: "SELECT l.id, l.name FROM devices() AS l",
    params: [{ key: "$1", value: "dev1" }],
    created_at: new Date("2026-08-06T14:42:52.390Z"),
  };

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    writeStatusMock.mockClear();
    pickSQLIDMock.mockReset().mockResolvedValue("sql1");
    resourcesInstance.sql.getVersion.mockResolvedValue(version);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", { rev: 1 } as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches the requested version", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await sqlVersion("sql1", { rev: 3 } as never);

    expect(resourcesInstance.sql.getVersion).toHaveBeenCalledWith("sql1", 3);
  });

  /**
   * The option is `--rev`, not `--version`: `program.version()` in src/index.ts
   * registers `--version` globally, so commander would answer it with the CLI's
   * own version and exit before this command ever ran. Caught by running the
   * real parser — every unit test here calls the function directly and would
   * pass either way.
   */
  test("--rev is required", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", {} as never)).rejects.toThrow(/missing_input/);

    expect(resourcesInstance.sql.getVersion).not.toHaveBeenCalled();
  });

  test("the missing-input message names --rev, not --version", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", {} as never)).rejects.toThrow(/--rev/);
  });

  test("a non-numeric version fails offline", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", { rev: Number.NaN } as never)).rejects.toThrow(/invalid_version/);

    expect(resourcesInstance.sql.getVersion).not.toHaveBeenCalled();
  });

  test("version zero fails offline, since versions start at 1", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", { rev: 0 } as never)).rejects.toThrow(/invalid_version/);
  });

  test("prompts for the query when the id is omitted", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await sqlVersion(undefined, { rev: 1 } as never);

    expect(pickSQLIDMock).toHaveBeenCalled();
    expect(resourcesInstance.sql.getVersion).toHaveBeenCalledWith("sql1", 1);
  });

  test("--silent without an id fails and never prompts", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion(undefined, { rev: 1, silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickSQLIDMock).not.toHaveBeenCalled();
  });

  test("--json carries the query and params of that version", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await sqlVersion("sql1", { rev: 1, json: true } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed.query).toBe(version.query);
    expect(parsed.params).toEqual(version.params);
  });

  test("the human view writes the query to stderr, not stdout", async () => {
    const { sqlVersion } = await import("./sql-version.js");
    await sqlVersion("sql1", { rev: 1 } as never);

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(writeStatusMock.mock.calls.map((call) => String(call[0])).join("\n")).toMatch(/SELECT/);
  });

  /** Probed: a version above the current answers `SQL Query version can't be found`. */
  test("a version that does not exist reports version_not_found", async () => {
    resourcesInstance.sql.getVersion.mockRejectedValue(new Error("SQL Query version can't be found"));

    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", { rev: 99 } as never)).rejects.toThrow(/version_not_found/);
  });

  test("the failure routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.getVersion.mockRejectedValue(new Error("SQL Query version can't be found"));

    const { sqlVersion } = await import("./sql-version.js");
    await expect(sqlVersion("sql1", { rev: 99, json: true } as never)).rejects.toThrow(/^json:version_not_found:/);
  });
});
