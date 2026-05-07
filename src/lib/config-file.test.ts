import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const getCurrentFolderMock = vi.fn();
const readTokenMock = vi.fn();
const infoMSGMock = vi.fn();
const errorHandlerMock = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("./get-current-folder.js", () => ({
  getCurrentFolder: getCurrentFolderMock,
}));

vi.mock("./token.js", () => ({
  readToken: readTokenMock,
}));

vi.mock("./messages.js", () => ({
  infoMSG: infoMSGMock,
  errorHandler: errorHandlerMock,
  highlightMSG: (s: string) => s,
}));

vi.mock("./dotenv-config.js", () => ({
  setEnvironmentVariables: vi.fn(),
}));

describe("config-file", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    getCurrentFolderMock.mockReset().mockReturnValue("/repo");
    readTokenMock.mockReset().mockReturnValue("tok-123");
    infoMSGMock.mockReset();
    errorHandlerMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TAGOIO_DEFAULT;
  });

  describe("getProfileRegion", () => {
    test("defaults to 'us-e1' when the environment has no custom API URL", async () => {
      const { getProfileRegion } = await import("./config-file.js");
      expect(
        getProfileRegion({
          analysisList: [],
          id: "x",
          profileName: "p",
          email: "e",
        }),
      ).toBe("us-e1");
    });

    test("returns an {api, sse} object when the environment defines tagoAPIURL", async () => {
      const { getProfileRegion } = await import("./config-file.js");
      expect(
        getProfileRegion({
          analysisList: [],
          id: "x",
          profileName: "p",
          email: "e",
          tagoAPIURL: "https://api.custom.tago.io",
          tagoSSEURL: "https://sse.custom.tago.io",
        }),
      ).toEqual({ api: "https://api.custom.tago.io", sse: "https://sse.custom.tago.io" });
    });

    test("uses empty string for sse when tagoSSEURL is omitted (custom API only)", async () => {
      const { getProfileRegion } = await import("./config-file.js");
      expect(
        getProfileRegion({
          analysisList: [],
          id: "x",
          profileName: "p",
          email: "e",
          tagoAPIURL: "https://api.custom.tago.io",
        }),
      ).toEqual({ api: "https://api.custom.tago.io", sse: "" });
    });
  });

  describe("getEnvironmentConfig", () => {
    const configFile = {
      default: "prod",
      analysisPath: "./custom/analysis",
      buildPath: "./custom/build",
      prod: {
        id: "env-id",
        profileName: "Prod",
        email: "prod@example.com",
        analysisList: [{ name: "a", fileName: "a.ts", id: "a-id" }],
      },
      stage: {
        id: "env-id-s",
        profileName: "Stage",
        email: "stage@example.com",
        analysisList: [],
        tagoAPIURL: "https://api.stage.tago.io",
      },
    };

    test("returns merged env + paths + token for an explicit environment name", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));

      const { getEnvironmentConfig } = await import("./config-file.js");
      const result = getEnvironmentConfig("prod");

      expect(result).toMatchObject({
        profileName: "Prod",
        email: "prod@example.com",
        analysisPath: "./custom/analysis",
        buildPath: "./custom/build",
        profileToken: "tok-123",
        profileRegion: "us-e1",
      });
      expect(readTokenMock).toHaveBeenCalledWith("prod");
      expect(infoMSGMock).toHaveBeenCalled();
    });

    test("expands profileRegion into an object when the env defines a custom API URL", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));

      const { getEnvironmentConfig } = await import("./config-file.js");
      const result = getEnvironmentConfig("stage");

      expect(result?.profileRegion).toEqual({ api: "https://api.stage.tago.io", sse: "" });
    });

    test("falls back to TAGOIO_DEFAULT when no environment is passed", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      process.env.TAGOIO_DEFAULT = "prod";

      const { getEnvironmentConfig } = await import("./config-file.js");
      const result = getEnvironmentConfig();

      expect(result?.profileName).toBe("Prod");
      expect(readTokenMock).toHaveBeenCalledWith("prod");
    });

    test("routes through errorHandler when no default env is set and no name is provided", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      delete process.env.TAGOIO_DEFAULT;
      // Real errorHandler terminates via process.exit(1) — simulate with a throw so code after it
      // does not execute (otherwise the test hits an unrelated undefined access downstream).
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig()).toThrow(/No environment found/);
      expect(errorHandlerMock).toHaveBeenCalled();
    });

    test("routes through errorHandler when requested env is not in the config", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig("missing-env")).toThrow(/Environment not found/);
    });

    test("routes through errorHandler when default env points to missing config entry", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      process.env.TAGOIO_DEFAULT = "not-there";
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig()).toThrow(/Default Environment not found/);
    });
  });

  describe("getConfigFile", () => {
    test("creates an empty config file when none exists and returns it parsed", async () => {
      existsSyncMock.mockReturnValue(false);
      readFileSyncMock.mockReturnValue("{}");

      const { getConfigFile } = await import("./config-file.js");
      const result = getConfigFile();
      expect(writeFileSyncMock).toHaveBeenCalled();
      expect(result).toEqual({});
    });

    test("returns undefined when the file cannot be parsed", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue("not-json");

      const { getConfigFile } = await import("./config-file.js");
      expect(getConfigFile()).toBeUndefined();
    });
  });

  describe("writeConfigFileEnv", () => {
    test("writes the env block to the config file", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify({ default: "prod" }));
      process.env.TAGOIO_DEFAULT = "prod";

      const { writeConfigFileEnv } = await import("./config-file.js");
      writeConfigFileEnv("stage", {
        analysisList: [],
        id: "s",
        profileName: "Stage",
        email: "s@x",
      });

      expect(writeFileSyncMock).toHaveBeenCalled();
      const [, payload] = writeFileSyncMock.mock.calls[writeFileSyncMock.mock.calls.length - 1];
      expect(JSON.parse(payload as string)).toMatchObject({ stage: { id: "s", profileName: "Stage" } });
    });
  });

  describe("writeToConfigFile", () => {
    test("writes the provided config object to disk", async () => {
      getCurrentFolderMock.mockReturnValue("/repo");
      const { writeToConfigFile } = await import("./config-file.js");
      // The function signature accepts IConfigFile & IConfigFileEnvs, but internally only writes the JSON,
      // so any plain object is sufficient for the write-path test.
      writeToConfigFile({ default: "prod", analysisPath: "x", buildPath: "y" } as never);
      expect(writeFileSyncMock).toHaveBeenCalled();
    });
  });

  describe("setDefault", () => {
    test("updates the default key when the environment exists", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          default: "old",
          prod: { id: "p", profileName: "Prod", email: "e", analysisList: [] },
        }),
      );

      const { setDefault } = await import("./config-file.js");
      setDefault("prod");
      const [, payload] = writeFileSyncMock.mock.calls[writeFileSyncMock.mock.calls.length - 1];
      expect(JSON.parse(payload as string).default).toBe("prod");
    });

    test("errors out when the target env is not in the config", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify({ default: "prod" }));
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { setDefault } = await import("./config-file.js");
      expect(() => setDefault("ghost")).toThrow(/not in the tagoconfig/);
    });
  });

  describe("resolveCLIPath", () => {
    test("returns a normalized path joined to the cli root", async () => {
      const { resolveCLIPath } = await import("./config-file.js");
      const result = resolveCLIPath("/node_modules/foo");
      expect(typeof result).toBe("string");
      expect(result).toContain("node_modules/foo");
    });
  });
});
