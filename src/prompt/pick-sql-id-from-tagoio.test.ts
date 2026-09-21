import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickSQLIDFromTagoIO", () => {
  const queryList = [
    { id: "sql1", name: "freezer_temp_summary" },
    { id: "sql2", name: "test" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the query id the user picked", async () => {
    const resources = makeAccount();
    resources.sql.list.mockResolvedValue(queryList);

    const { pickSQLIDFromTagoIO } = await import("./pick-sql-id-from-tagoio.js");
    prompts.inject(["sql1"]);

    await expect(pickSQLIDFromTagoIO(resources as never)).resolves.toBe("sql1");
  });

  /**
   * `fields` is passed for intent even though the API currently ignores it on
   * this endpoint — probed, asking for six returned three. Asking for the two
   * the label needs stays correct if that changes.
   */
  test("requests only the fields the label needs", async () => {
    const resources = makeAccount();
    resources.sql.list.mockResolvedValue(queryList);

    const { pickSQLIDFromTagoIO } = await import("./pick-sql-id-from-tagoio.js");
    prompts.inject(["sql1"]);

    await pickSQLIDFromTagoIO(resources as never);
    expect(resources.sql.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "name"] });
  });

  test("labels each choice with name and id, resolving to the id", async () => {
    const { toSQLChoices } = await import("./pick-sql-id-from-tagoio.js");

    expect(toSQLChoices(queryList as never)).toEqual([
      { title: "freezer_temp_summary [sql1]", value: "sql1" },
      { title: "test [sql2]", value: "sql2" },
    ]);
  });

  test("a query with no name is still identifiable by its id", async () => {
    const { toSQLChoices } = await import("./pick-sql-id-from-tagoio.js");

    expect(toSQLChoices([{ id: "sql9", name: "" }] as never)).toEqual([{ title: "sql9", value: "sql9" }]);
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.sql.list.mockResolvedValue(queryList);

    const { pickSQLIDFromTagoIO } = await import("./pick-sql-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickSQLIDFromTagoIO(resources as never)).rejects.toThrow(/not selected/);
  });
});
