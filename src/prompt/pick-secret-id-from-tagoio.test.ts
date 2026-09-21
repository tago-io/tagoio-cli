import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickSecretIDFromTagoIO", () => {
  const secretList = [
    { id: "sec1", key: "TWILIO_SID" },
    { id: "sec2", key: "SENDGRID_API_KEY" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the secret id the user picked", async () => {
    const resources = makeAccount();
    resources.secrets.list.mockResolvedValue(secretList);

    const { pickSecretIDFromTagoIO } = await import("./pick-secret-id-from-tagoio.js");
    prompts.inject(["sec1"]);

    await expect(pickSecretIDFromTagoIO(resources as never)).resolves.toBe("sec1");
  });

  test("requests only the fields the label needs", async () => {
    const resources = makeAccount();
    resources.secrets.list.mockResolvedValue(secretList);

    const { pickSecretIDFromTagoIO } = await import("./pick-secret-id-from-tagoio.js");
    prompts.inject(["sec1"]);

    await pickSecretIDFromTagoIO(resources as never);
    expect(resources.secrets.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "key"] });
  });

  /**
   * A secret has no name, so the key is the whole label. Exported separately
   * because the module calls `prompts(...)` as a function, which a spy on
   * `prompts.prompt` never intercepts.
   */
  test("labels each choice with its key, resolving to the id", async () => {
    const { toSecretChoices } = await import("./pick-secret-id-from-tagoio.js");

    expect(toSecretChoices(secretList as never)).toEqual([
      { title: "TWILIO_SID", value: "sec1" },
      { title: "SENDGRID_API_KEY", value: "sec2" },
    ]);
  });

  test("a secret list carrying no value never leaks one into the label", async () => {
    const { toSecretChoices } = await import("./pick-secret-id-from-tagoio.js");

    const choices = toSecretChoices([{ id: "s1", key: "K", value_length: 12 }] as never);
    expect(JSON.stringify(choices)).not.toContain("12");
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.secrets.list.mockResolvedValue(secretList);

    const { pickSecretIDFromTagoIO } = await import("./pick-secret-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickSecretIDFromTagoIO(resources as never)).rejects.toThrow(/Secret not selected/);
  });
});
