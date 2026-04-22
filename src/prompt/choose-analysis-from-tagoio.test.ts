import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("chooseAnalysisFromTagoIO", () => {
  const analysisList = [
    { id: "a-id", name: "A", tags: [] },
    { id: "b-id", name: "B", tags: [] },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the analyses the user selected", async () => {
    const account = makeAccount();
    account.analysis.list.mockResolvedValue(analysisList);

    const { chooseAnalysisFromTagoIO } = await import("./choose-analysis-from-tagoio.js");
    prompts.inject([[analysisList[0]]]);

    await expect(chooseAnalysisFromTagoIO(account as never)).resolves.toEqual([analysisList[0]]);
  });

  test("returns an empty array when the user submits with no selection", async () => {
    const account = makeAccount();
    account.analysis.list.mockResolvedValue(analysisList);

    const { chooseAnalysisFromTagoIO } = await import("./choose-analysis-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(chooseAnalysisFromTagoIO(account as never)).resolves.toEqual([]);
  });
});
