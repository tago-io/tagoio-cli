import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickEntityIDFromTagoIO", () => {
  const entityList = [
    { id: "ent1", name: "Entity One" },
    { id: "ent2", name: "Entity Two" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the entity id the user picked", async () => {
    const resources = makeAccount();
    resources.entities.list.mockResolvedValue(entityList);

    const { pickEntityIDFromTagoIO } = await import("./pick-entity-id-from-tagoio.js");
    prompts.inject(["ent1"]);

    await expect(pickEntityIDFromTagoIO(resources as never)).resolves.toBe("ent1");
    expect(resources.entities.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "name"] });
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.entities.list.mockResolvedValue(entityList);

    const { pickEntityIDFromTagoIO } = await import("./pick-entity-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickEntityIDFromTagoIO(resources as never)).rejects.toThrow(/Entity not selected/);
  });
});
