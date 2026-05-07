import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { promptTextToEnter } from "./text-prompt.js";

describe("promptTextToEnter", () => {
  test("returns the text the user typed", async () => {
    prompts.inject(["hello"]);
    await expect(promptTextToEnter("Name?")).resolves.toBe("hello");
  });

  test("falls back to the initial value when the user submits nothing", async () => {
    prompts.inject([undefined]);
    await expect(promptTextToEnter("Name?", "default-value")).resolves.toBe("default-value");
  });
});
