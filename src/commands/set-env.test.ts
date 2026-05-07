import { beforeEach, describe, expect, test, vi } from "vitest";

const getConfigFileMock = vi.fn();
const setEnvironmentVariablesMock = vi.fn();
const pickEnvironmentMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const successMSGMock = vi.fn();

vi.mock("../lib/config-file.js", () => ({
  getConfigFile: getConfigFileMock,
}));

vi.mock("../lib/dotenv-config.js", () => ({
  setEnvironmentVariables: setEnvironmentVariablesMock,
}));

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
}));

vi.mock("../prompt/pick-environment.js", () => ({
  pickEnvironment: pickEnvironmentMock,
}));

describe("setEnvironment", () => {
  beforeEach(() => {
    getConfigFileMock.mockReset();
    setEnvironmentVariablesMock.mockReset();
    pickEnvironmentMock.mockReset();
    errorHandlerMock.mockClear();
    successMSGMock.mockClear();
  });

  test("returns silently when the config file is missing", async () => {
    getConfigFileMock.mockReturnValue(undefined);

    const { setEnvironment } = await import("./set-env.js");
    await expect(setEnvironment("prod")).resolves.toBeUndefined();
    expect(setEnvironmentVariablesMock).not.toHaveBeenCalled();
  });

  test("errors when the named environment is not in the config", async () => {
    getConfigFileMock.mockReturnValue({ dev: { id: "a" } });

    const { setEnvironment } = await import("./set-env.js");
    await expect(setEnvironment("missing")).rejects.toThrow(/Environment doesn't exist/);
  });

  test("sets the default environment and reports success", async () => {
    getConfigFileMock.mockReturnValue({ prod: { id: "a" } });

    const { setEnvironment } = await import("./set-env.js");
    await setEnvironment("prod");

    expect(setEnvironmentVariablesMock).toHaveBeenCalledWith({ TAGOIO_DEFAULT: "prod" });
    expect(successMSGMock).toHaveBeenCalledWith(expect.stringContaining("prod"));
  });

  test("prompts for an environment when none is provided", async () => {
    getConfigFileMock.mockReturnValue({ dev: { id: "a" } });
    pickEnvironmentMock.mockResolvedValue("dev");

    const { setEnvironment } = await import("./set-env.js");
    await setEnvironment();

    expect(pickEnvironmentMock).toHaveBeenCalled();
    expect(setEnvironmentVariablesMock).toHaveBeenCalledWith({ TAGOIO_DEFAULT: "dev" });
  });
});
