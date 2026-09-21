import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickActionIDFromTagoIO", () => {
  const actionList = [
    { id: "act1", name: "Action One" },
    { id: "act2", name: "Action Two" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the action id the user picked", async () => {
    const resources = makeAccount();
    resources.actions.list.mockResolvedValue(actionList);

    const { pickActionIDFromTagoIO } = await import("./pick-action-id-from-tagoio.js");
    prompts.inject(["act1"]);

    await expect(pickActionIDFromTagoIO(resources as never)).resolves.toBe("act1");
  });

  // 200 is the Scale-plan ceiling for Actions per TagoIO's resource limits, so
  // requesting it guarantees the picker never silently truncates the list.
  test("requests up to the plan ceiling of 200 actions", async () => {
    const resources = makeAccount();
    resources.actions.list.mockResolvedValue(actionList);

    const { pickActionIDFromTagoIO } = await import("./pick-action-id-from-tagoio.js");
    prompts.inject(["act1"]);

    await pickActionIDFromTagoIO(resources as never);
    expect(resources.actions.list).toHaveBeenCalledWith({ amount: 200, fields: ["id", "name"] });
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.actions.list.mockResolvedValue(actionList);

    const { pickActionIDFromTagoIO } = await import("./pick-action-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickActionIDFromTagoIO(resources as never)).rejects.toThrow(/Action not selected/);
  });
});
