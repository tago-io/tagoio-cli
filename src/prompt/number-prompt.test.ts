import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { promptNumber } from "./number-prompt.js";

describe("promptNumber", () => {
  test("returns the number the user typed", async () => {
    prompts.inject([42]);
    await expect(promptNumber("Count?")).resolves.toBe(42);
  });

  test("forwards min/max/initial options to the underlying prompt", async () => {
    prompts.inject([5]);
    await expect(promptNumber("Count?", { min: 0, max: 10, initial: 5 })).resolves.toBe(5);
  });
});
