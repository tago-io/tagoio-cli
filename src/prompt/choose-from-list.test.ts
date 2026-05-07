import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { chooseFromList } from "./choose-from-list.js";

describe("chooseFromList", () => {
  test("returns the list of values the user selected", async () => {
    const list = [
      { title: "A", value: "a" },
      { title: "B", value: "b" },
      { title: "C", value: "c" },
    ];
    prompts.inject([["a", "c"]]);

    await expect(chooseFromList(list)).resolves.toEqual(["a", "c"]);
  });

  test("returns an empty array when the user selects nothing", async () => {
    const list = [
      { title: "A", value: "a" },
      { title: "B", value: "b" },
    ];
    prompts.inject([[]]);

    await expect(chooseFromList(list)).resolves.toEqual([]);
  });
});
