import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { chooseAnalysisListFromConfig } from "./choose-analysis-list-config.js";

describe("chooseAnalysisListFromConfig", () => {
  const analysisList = [
    { name: "A", fileName: "a.ts", id: "a-id" },
    { name: "B", fileName: "b.ts", id: "b-id" },
  ];

  test("returns the analyses the user picked", async () => {
    prompts.inject([[analysisList[1]]]);

    await expect(chooseAnalysisListFromConfig(analysisList)).resolves.toEqual([analysisList[1]]);
  });

  test("returns an empty array when the user cancels", async () => {
    prompts.inject([undefined]);

    await expect(chooseAnalysisListFromConfig(analysisList)).resolves.toEqual([]);
  });
});
