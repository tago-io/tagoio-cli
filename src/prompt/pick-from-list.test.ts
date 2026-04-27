import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { pickFromList } from "./pick-from-list.js";

describe("pickFromList", () => {
  test("returns the value of the option the user picked", async () => {
    const list = [
      { title: "First", value: "one" },
      { title: "Second", value: "two" },
    ];
    prompts.inject(["two"]);

    await expect(pickFromList(list, { message: "Pick" })).resolves.toBe("two");
  });

  test("honors the initial index when the user accepts the default", async () => {
    const list = [
      { title: "Red", value: "r" },
      { title: "Green", value: "g" },
      { title: "Blue", value: "b" },
    ];
    prompts.inject(["g"]);

    await expect(pickFromList(list, { message: "Pick", initial: "g" })).resolves.toBe("g");
  });
});
