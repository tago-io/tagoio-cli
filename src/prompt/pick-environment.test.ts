import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getConfigFileMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/config-file.js", () => ({
  getConfigFile: getConfigFileMock,
}));

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickEnvironment", () => {
  beforeEach(() => {
    getConfigFileMock.mockReset();
    errorHandlerMock.mockClear();
    delete process.env.TAGOIO_DEFAULT;
  });

  afterEach(() => {
    delete process.env.TAGOIO_DEFAULT;
  });

  test("returns the env name the user picked (filters out string keys like default)", async () => {
    getConfigFileMock.mockReturnValue({
      default: "prod",
      analysisPath: "./src",
      prod: { id: "p1", profileName: "P" },
      stage: { id: "s1", profileName: "S" },
    });

    const { pickEnvironment } = await import("./pick-environment.js");
    prompts.inject(["stage"]);

    await expect(pickEnvironment()).resolves.toBe("stage");
  });

  test("calls errorHandler when the config file is missing", async () => {
    getConfigFileMock.mockReturnValue(undefined);

    const { pickEnvironment } = await import("./pick-environment.js");

    await expect(pickEnvironment()).rejects.toThrow(/Couldnt load config file/);
  });

  test("calls errorHandler when the user cancels without selecting an env", async () => {
    getConfigFileMock.mockReturnValue({
      default: "prod",
      prod: { id: "p1" },
    });

    const { pickEnvironment } = await import("./pick-environment.js");
    // Real cancellation (e.g., Ctrl+C) surfaces as a thrown error inside the prompt,
    // which prompts handles by returning {} — i.e. `environment` is undefined.
    prompts.inject([new Error("cancelled")]);

    await expect(pickEnvironment()).rejects.toThrow(/Environment not selected/);
  });
});
