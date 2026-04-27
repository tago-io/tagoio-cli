import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickAnalysisFromTagoIO", () => {
  const analysisList = [
    { id: "a-id", name: "Analysis A", tags: [] },
    { id: "b-id", name: "Analysis B", tags: [] },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the analysis the user picked from the account list", async () => {
    const account = makeAccount();
    account.analysis.list.mockResolvedValue(analysisList);

    const { pickAnalysisFromTagoIO } = await import("./pick-analysis-from-tagoio.js");
    prompts.inject([analysisList[1]]);

    await expect(pickAnalysisFromTagoIO(account as never)).resolves.toEqual(analysisList[1]);
    expect(account.analysis.list).toHaveBeenCalledWith({ amount: 35, fields: ["id", "name", "tags"] });
  });

  test("calls errorHandler when the user cancels the selection", async () => {
    const account = makeAccount();
    account.analysis.list.mockResolvedValue(analysisList);

    const { pickAnalysisFromTagoIO } = await import("./pick-analysis-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickAnalysisFromTagoIO(account as never)).rejects.toThrow(/Cancelled/);
    expect(errorHandlerMock).toHaveBeenCalledWith("Cancelled");
  });
});
