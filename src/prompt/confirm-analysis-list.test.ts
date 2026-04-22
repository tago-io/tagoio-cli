import prompts from "prompts";
import { describe, expect, test } from "vitest";

import { confirmAnalysisFromConfig } from "./confirm-analysis-list.js";

describe("confirmAnalysisFromConfig", () => {
  const analysisList = [
    { name: "A", fileName: "a.ts", id: "a-id" },
    { name: "B", fileName: "b.ts", id: "b-id" },
  ];

  test("returns the subset the user confirmed", async () => {
    prompts.inject([[analysisList[0]]]);

    await expect(confirmAnalysisFromConfig(analysisList)).resolves.toEqual([analysisList[0]]);
  });

  test("returns an empty array when the user submits with no selection", async () => {
    prompts.inject([undefined]);

    await expect(confirmAnalysisFromConfig(analysisList)).resolves.toEqual([]);
  });
});
