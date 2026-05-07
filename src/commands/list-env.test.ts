import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const getConfigFileMock = vi.fn();
const getProfileRegionMock = vi.fn();
const writeToConfigFileMock = vi.fn();
const readTokenMock = vi.fn();
const errorHandlerMock = vi.fn();
const infoMSGMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount> & { info: ReturnType<typeof vi.fn> };

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

function makeAccountWithInfo() {
  const acc = makeAccount() as ReturnType<typeof makeAccount> & { info: ReturnType<typeof vi.fn> };
  acc.info = vi.fn();
  return acc;
}

vi.mock("../lib/config-file.js", () => ({
  getConfigFile: getConfigFileMock,
  getProfileRegion: getProfileRegionMock,
  writeToConfigFile: writeToConfigFileMock,
}));

vi.mock("../lib/token.js", () => ({
  readToken: readTokenMock,
}));

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
}));

describe("listEnvironment", () => {
  beforeEach(() => {
    accountInstance = makeAccountWithInfo();
    getConfigFileMock.mockReset();
    getProfileRegionMock.mockReset();
    writeToConfigFileMock.mockReset();
    readTokenMock.mockReset();
    errorHandlerMock.mockClear();
    infoMSGMock.mockClear();
  });

  test("returns silently when the config file is missing", async () => {
    getConfigFileMock.mockReturnValue(undefined);

    const { listEnvironment } = await import("./list-env.js");
    await expect(listEnvironment()).resolves.toBeUndefined();
    expect(infoMSGMock).not.toHaveBeenCalled();
  });

  test("skips environments without a token but still lists them", async () => {
    getConfigFileMock.mockReturnValue({
      analysisPath: "./analysis",
      prod: { id: "", profileName: "", email: "" },
    });
    readTokenMock.mockReturnValue(undefined);

    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { listEnvironment } = await import("./list-env.js");
    await listEnvironment();

    expect(infoMSGMock).toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalled();
    tableSpy.mockRestore();
  });

  test("fetches profile info and updates each environment with a token", async () => {
    const configFile = {
      analysisPath: "./analysis",
      prod: { id: "", profileName: "", email: "" },
    };
    getConfigFileMock.mockReturnValue(configFile);
    readTokenMock.mockReturnValue("some-token");
    getProfileRegionMock.mockReturnValue("us-e1");
    accountInstance.profiles.info.mockResolvedValue({ info: { id: "profile-id", name: "Profile" } });
    accountInstance.info.mockResolvedValue({ email: "user@example.com" });

    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { listEnvironment } = await import("./list-env.js");
    await listEnvironment();

    expect(configFile.prod.id).toBe("profile-id");
    expect(configFile.prod.profileName).toBe("Profile");
    expect(configFile.prod.email).toBe("user@example.com");
    expect(writeToConfigFileMock).toHaveBeenCalledWith(configFile);
    tableSpy.mockRestore();
  });

  test("falls back to N/A when profile fetch fails and no prior info is set", async () => {
    const configFile = {
      analysisPath: "./analysis",
      prod: { id: "", profileName: "", email: "" },
    };
    getConfigFileMock.mockReturnValue(configFile);
    readTokenMock.mockReturnValue("some-token");
    getProfileRegionMock.mockReturnValue("us-e1");
    accountInstance.profiles.info.mockRejectedValue(new Error("network down"));

    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { listEnvironment } = await import("./list-env.js");
    await listEnvironment();

    expect(configFile.prod.id).toBe("N/A");
    expect(configFile.prod.profileName).toBe("N/A");
    tableSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("marks the default environment with 'Default: Yes' in the output row", async () => {
    const configFile = {
      analysisPath: "./analysis",
      prod: { id: "p1", profileName: "Prod", email: "e@x" },
    };
    getConfigFileMock.mockReturnValue(configFile);
    readTokenMock.mockReturnValue(undefined); // skip fetching
    process.env.TAGOIO_DEFAULT = "prod";

    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { listEnvironment } = await import("./list-env.js");
    await listEnvironment();

    const [rows] = tableSpy.mock.calls[0];
    const prodRow = (rows as unknown[]).find((r) => (r as { Environment: string }).Environment === "prod");
    expect(prodRow).toMatchObject({ Default: "Yes" });
    tableSpy.mockRestore();
    delete process.env.TAGOIO_DEFAULT;
  });
});
