import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickAccessIDFromTagoIO", () => {
  const policyList = [
    { id: "acc1", name: "[TagoIO Permission for Analysis] - Alert Dispatch" },
    { id: "acc2", name: "[TagoIO Permission for Analysis] - CRUD Sensor" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the policy id the user picked", async () => {
    const resources = makeAccount();
    resources.accessManagement.list.mockResolvedValue(policyList);

    const { pickAccessIDFromTagoIO } = await import("./pick-access-id-from-tagoio.js");
    prompts.inject(["acc1"]);

    await expect(pickAccessIDFromTagoIO(resources as never)).resolves.toBe("acc1");
  });

  /**
   * `permissions` and `targets` must stay out of the field list: probed, asking
   * for either makes the API answer "Sorry, Internal Error" — a 500, not an
   * omitted field.
   */
  test("requests only id and name, never permissions or targets", async () => {
    const resources = makeAccount();
    resources.accessManagement.list.mockResolvedValue(policyList);

    const { pickAccessIDFromTagoIO } = await import("./pick-access-id-from-tagoio.js");
    prompts.inject(["acc1"]);

    await pickAccessIDFromTagoIO(resources as never);
    expect(resources.accessManagement.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "name"] });
  });

  /**
   * Nine of the twelve policies on a real profile share the
   * `[TagoIO Permission for Analysis]` prefix, so the id is what disambiguates.
   * Exported separately because the module calls `prompts(...)` as a function,
   * which a spy on `prompts.prompt` never intercepts.
   */
  test("labels each choice with name and id, resolving to the id", async () => {
    const { toAccessChoices } = await import("./pick-access-id-from-tagoio.js");

    expect(toAccessChoices(policyList as never)).toEqual([
      { title: "[TagoIO Permission for Analysis] - Alert Dispatch [acc1]", value: "acc1" },
      { title: "[TagoIO Permission for Analysis] - CRUD Sensor [acc2]", value: "acc2" },
    ]);
  });

  test("a policy with no name is still identifiable by its id", async () => {
    const { toAccessChoices } = await import("./pick-access-id-from-tagoio.js");

    expect(toAccessChoices([{ id: "acc9", name: "" }] as never)).toEqual([{ title: "acc9", value: "acc9" }]);
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.accessManagement.list.mockResolvedValue(policyList);

    const { pickAccessIDFromTagoIO } = await import("./pick-access-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickAccessIDFromTagoIO(resources as never)).rejects.toThrow(/not selected/);
  });
});
