import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickRunUserIDFromTagoIO", () => {
  const userList = [
    { id: "usr1", name: "Mateus Silva", email: "mateus.silva@tago.io" },
    { id: "usr2", name: "Super Admin", email: "mateus.silva+test@tago.io" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the run user id the user picked", async () => {
    const resources = makeAccount();
    resources.run.listUsers.mockResolvedValue(userList);

    const { pickRunUserIDFromTagoIO } = await import("./pick-run-user-id-from-tagoio.js");
    prompts.inject(["usr1"]);

    await expect(pickRunUserIDFromTagoIO(resources as never)).resolves.toBe("usr1");
  });

  test("requests only the fields the label needs", async () => {
    const resources = makeAccount();
    resources.run.listUsers.mockResolvedValue(userList);

    const { pickRunUserIDFromTagoIO } = await import("./pick-run-user-id-from-tagoio.js");
    prompts.inject(["usr1"]);

    await pickRunUserIDFromTagoIO(resources as never);
    expect(resources.run.listUsers).toHaveBeenCalledWith({ amount: 10000, fields: ["id", "name", "email"] });
  });

  /**
   * A portal has duplicate display names far more often than duplicate emails,
   * and the API treats the email as the user's identity. Exported separately
   * because the module calls `prompts(...)` as a function, which a spy on
   * `prompts.prompt` never intercepts.
   */
  test("labels each choice with name and email, resolving to the id", async () => {
    const { toRunUserChoices } = await import("./pick-run-user-id-from-tagoio.js");

    expect(toRunUserChoices(userList as never)).toEqual([
      { title: "Mateus Silva <mateus.silva@tago.io>", value: "usr1" },
      { title: "Super Admin <mateus.silva+test@tago.io>", value: "usr2" },
    ]);
  });

  /**
   * Nothing in `UserInfo` guarantees a non-empty `name`. Falling back to the
   * email keeps the choice identifiable instead of rendering a bare `<...>`.
   */
  test("a user with no name is still identifiable by its email", async () => {
    const { toRunUserChoices } = await import("./pick-run-user-id-from-tagoio.js");

    expect(toRunUserChoices([{ id: "u1", name: "", email: "nameless@tago.io" }] as never)).toEqual([{ title: "nameless@tago.io", value: "u1" }]);
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.run.listUsers.mockResolvedValue(userList);

    const { pickRunUserIDFromTagoIO } = await import("./pick-run-user-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickRunUserIDFromTagoIO(resources as never)).rejects.toThrow(/Run user not selected/);
  });
});
