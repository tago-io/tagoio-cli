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

describe("sqlDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickSQLIDMock.mockReset().mockResolvedValue("sql1");
    resourcesInstance.sql.info.mockResolvedValue({
      id: "sql1",
      name: "freezer_temp_summary",
      version: 9,
      versions: { "1": {}, "2": {}, "9": {} },
    });
    resourcesInstance.sql.delete.mockResolvedValue({ id: "sql1" });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { sqlDelete } = await import("./sql-delete.js");
    await expect(sqlDelete("sql1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("deletes after the confirmation is accepted", async () => {
    prompts.inject([true]);

    const { sqlDelete } = await import("./sql-delete.js");
    await sqlDelete("sql1", {} as never);

    expect(resourcesInstance.sql.delete).toHaveBeenCalledWith("sql1");
  });

  test("declining makes no delete call", async () => {
    prompts.inject([false]);

    const { sqlDelete } = await import("./sql-delete.js");
    await sqlDelete("sql1", {} as never);

    expect(resourcesInstance.sql.delete).not.toHaveBeenCalled();
  });

  test("the confirmation names the query", async () => {
    const { buildDeleteMessage } = await import("./sql-delete.js");

    expect(buildDeleteMessage('SQL query "freezer_temp_summary"', 9)).toContain("freezer_temp_summary");
  });

  /**
   * Re-creating a query restores the SQL but not its history. A query at version
   * 9 has nine saved revisions going with it, and that is the part nothing can
   * bring back.
   */
  test("the confirmation states the version count", async () => {
    const { buildDeleteMessage } = await import("./sql-delete.js");

    expect(buildDeleteMessage('SQL query "q"', 9)).toMatch(/9 versions/);
  });

  test("the confirmation says the history is lost", async () => {
    const { buildDeleteMessage } = await import("./sql-delete.js");

    expect(buildDeleteMessage('SQL query "q"', 9)).toMatch(/histor/i);
  });

  test("a single version reads in the singular", async () => {
    const { buildDeleteMessage } = await import("./sql-delete.js");

    expect(buildDeleteMessage('SQL query "q"', 1)).toMatch(/1 version\b/);
  });

  test("describeTarget names the query and counts its versions", async () => {
    const { describeTarget } = await import("./sql-delete.js");

    const described = await describeTarget(resourcesInstance as never, "sql1");
    expect(described.label).toContain("freezer_temp_summary");
    expect(described.versions).toBe(3);
  });

  /** A failed read must not block a delete. */
  test("describeTarget falls back to the id when the lookup fails", async () => {
    resourcesInstance.sql.info.mockRejectedValue(new Error("nope"));

    const { describeTarget } = await import("./sql-delete.js");

    const described = await describeTarget(resourcesInstance as never, "sql1");
    expect(described.label).toContain("sql1");
    expect(described.versions).toBe(0);
  });

  test("a failed lookup still allows the delete", async () => {
    resourcesInstance.sql.info.mockRejectedValue(new Error("nope"));
    prompts.inject([true]);

    const { sqlDelete } = await import("./sql-delete.js");
    await sqlDelete("sql1", {} as never);

    expect(resourcesInstance.sql.delete).toHaveBeenCalledWith("sql1");
  });

  test("-y deletes without prompting", async () => {
    const promptSpy = vi.spyOn(prompts, "prompt");

    const { sqlDelete } = await import("./sql-delete.js");
    await sqlDelete("sql1", { yes: true } as never);

    expect(promptSpy).not.toHaveBeenCalled();
    expect(resourcesInstance.sql.delete).toHaveBeenCalledWith("sql1");
  });

  test("--silent deletes without prompting", async () => {
    const { sqlDelete } = await import("./sql-delete.js");
    await sqlDelete("sql1", { silent: true } as never);

    expect(resourcesInstance.sql.delete).toHaveBeenCalledWith("sql1");
  });

  test("--silent without an id fails and deletes nothing", async () => {
    const { sqlDelete } = await import("./sql-delete.js");
    await expect(sqlDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(resourcesInstance.sql.delete).not.toHaveBeenCalled();
  });

  /** `delete` resolves `{ id }`; the ack is synthesized for family consistency. */
  test("--json synthesizes the family's ack shape", async () => {
    const { sqlDelete } = await import("./sql-delete.js");
    await sqlDelete("sql1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "sql1", deleted: true });
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.sql.delete.mockRejectedValue(new Error("boom"));

    const { sqlDelete } = await import("./sql-delete.js");
    await expect(sqlDelete("sql1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
