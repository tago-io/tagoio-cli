import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  highlightMSG: (s: string) => s,
}));

describe("pickAnalysisFromConfig", () => {
  const analysisList = [
    { name: "A", fileName: "a.ts", id: "a-id" },
    { name: "B", fileName: "b.ts", id: "b-id" },
    { name: "no-file", fileName: "", id: "no-file-id" },
  ];

  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the analysis the user picked", async () => {
    const { pickAnalysisFromConfig } = await import("./pick-analysis-from-config.js");
    prompts.inject([analysisList[0]]);

    await expect(pickAnalysisFromConfig(analysisList)).resolves.toEqual(analysisList[0]);
    expect(errorHandlerMock).not.toHaveBeenCalled();
  });

  test("calls errorHandler when the user cancels selection", async () => {
    const { pickAnalysisFromConfig } = await import("./pick-analysis-from-config.js");
    prompts.inject([undefined]);

    await expect(pickAnalysisFromConfig(analysisList)).rejects.toThrow(/Analysis not selected/);
    expect(errorHandlerMock).toHaveBeenCalledWith("Analysis not selected");
  });

  test("handles an analysis entry without a fileName (falls back to name-only title)", async () => {
    const { pickAnalysisFromConfig } = await import("./pick-analysis-from-config.js");
    prompts.inject([analysisList[2]]);

    await expect(pickAnalysisFromConfig(analysisList)).resolves.toEqual(analysisList[2]);
  });
});
