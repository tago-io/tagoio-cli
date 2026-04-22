import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { datePrompt } from "./date-prompt.js";

describe("datePrompt", () => {
  test("returns the date the user picked", async () => {
    const picked = new Date("2026-01-15T10:30:00Z");
    prompts.inject([picked]);
    await expect(datePrompt()).resolves.toEqual(picked);
  });

  test("propagates the initialValue when the user submits without change", async () => {
    const initial = new Date("2026-04-01T00:00:00Z");
    prompts.inject([initial]);
    await expect(datePrompt("Pick", "YYYY-MM-DD", initial)).resolves.toEqual(initial);
  });
});
