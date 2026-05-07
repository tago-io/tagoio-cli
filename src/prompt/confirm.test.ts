import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { confirmPrompt } from "./confirm.js";

describe("confirmPrompt", () => {
  test("returns true when the user confirms", async () => {
    prompts.inject([true]);
    await expect(confirmPrompt("Proceed?")).resolves.toBe(true);
  });

  test("returns false when the user declines", async () => {
    prompts.inject([false]);
    await expect(confirmPrompt("Proceed?")).resolves.toBe(false);
  });
});
