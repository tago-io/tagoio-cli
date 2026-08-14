import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickDictionaryIDFromTagoIO", () => {
  const dictionaryList = [
    { id: "dic1", name: "Portal Strings", slug: "PORTAL" },
    { id: "dic2", name: "Alert Copy", slug: "ALERTS" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the dictionary id the user picked", async () => {
    const resources = makeAccount();
    resources.dictionaries.list.mockResolvedValue(dictionaryList);

    const { pickDictionaryIDFromTagoIO } = await import("./pick-dictionary-id-from-tagoio.js");
    prompts.inject(["dic1"]);

    await expect(pickDictionaryIDFromTagoIO(resources as never)).resolves.toBe("dic1");
  });

  test("requests the fields needed to label a choice", async () => {
    const resources = makeAccount();
    resources.dictionaries.list.mockResolvedValue(dictionaryList);

    const { pickDictionaryIDFromTagoIO } = await import("./pick-dictionary-id-from-tagoio.js");
    prompts.inject(["dic1"]);

    await pickDictionaryIDFromTagoIO(resources as never);
    expect(resources.dictionaries.list).toHaveBeenCalledWith({ amount: 100, fields: ["id", "name", "slug"] });
  });

  /**
   * A dictionary carries both a name and a slug, and the slug is the meaningful
   * secondary identifier — it is what `languageInfoBySlug` takes. Showing it
   * beats showing the opaque id.
   */
  test("labels each choice with its name and slug, resolving to the id", async () => {
    const { toDictionaryChoices } = await import("./pick-dictionary-id-from-tagoio.js");

    expect(toDictionaryChoices(dictionaryList as never)).toEqual([
      { title: "Portal Strings [PORTAL]", value: "dic1" },
      { title: "Alert Copy [ALERTS]", value: "dic2" },
    ]);
  });

  test("a dictionary with no slug still renders a usable label", async () => {
    const { toDictionaryChoices } = await import("./pick-dictionary-id-from-tagoio.js");

    expect(toDictionaryChoices([{ id: "d1", name: "No Slug" }] as never)).toEqual([{ title: "No Slug", value: "d1" }]);
  });

  test("calls errorHandler when the user cancels", async () => {
    const resources = makeAccount();
    resources.dictionaries.list.mockResolvedValue(dictionaryList);

    const { pickDictionaryIDFromTagoIO } = await import("./pick-dictionary-id-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickDictionaryIDFromTagoIO(resources as never)).rejects.toThrow(/Dictionary not selected/);
  });
});
