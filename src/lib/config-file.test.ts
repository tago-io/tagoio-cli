import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResolvedScope } from "./resolve-scope.js";

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const resolveScopeMock = vi.fn<() => ResolvedScope>();
const readTokenMock = vi.fn();
const infoMSGMock = vi.fn();
const errorHandlerMock = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("./resolve-scope.js", () => ({
  resolveScope: () => resolveScopeMock(),
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

const localScope: ResolvedScope = {
  scope: "local",
  root: "/repo",
  configPath: "/repo/tagoconfig.json",
  envFilePath: "/repo/.tagoio/personal.env",
  configExists: true,
};

const globalScope: ResolvedScope = {
  scope: "global",
  root: "/home/user/.config/tagoio",
  configPath: "/home/user/.config/tagoio/tagoconfig.json",
  envFilePath: "/home/user/.config/tagoio/.tagoio/personal.env",
  configExists: true,
};

describe("config-file", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    resolveScopeMock.mockReset().mockReturnValue(localScope);
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

  describe("getApiURL", () => {
    test("returns the public API URL for the default us-e1 region", async () => {
      const { getApiURL } = await import("./config-file.js");
      expect(getApiURL("us-e1")).toBe("https://api.us-e1.tago.io");
    });

    test("returns the public API URL for the eu-w1 region", async () => {
      const { getApiURL } = await import("./config-file.js");
      expect(getApiURL("eu-w1")).toBe("https://api.eu-w1.tago.io");
    });

    test("returns the region's own API URL for a custom region", async () => {
      const { getApiURL } = await import("./config-file.js");
      expect(getApiURL({ api: "https://api.eu.tago.io", sse: "https://sse.eu.tago.io" })).toBe("https://api.eu.tago.io");
    });

    test("trims a trailing slash from the region API URL", async () => {
      const { getApiURL } = await import("./config-file.js");
      expect(getApiURL({ api: "https://api.eu.tago.io/", sse: "" })).toBe("https://api.eu.tago.io");
    });

    test("falls back to the public API URL when a custom region has an empty api", async () => {
      const { getApiURL } = await import("./config-file.js");
      expect(getApiURL({ api: "", sse: "" })).toBe("https://api.tago.io");
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

    test("error message names the resolved scope and config path when no default is set", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      delete process.env.TAGOIO_DEFAULT;
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig()).toThrow(/local profile.*\/repo\/tagoconfig\.json/);
    });

    test("error message names the resolved scope when requested env is missing", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig("missing-env")).toThrow(/Environment 'missing-env' not found in local profile/);
    });

    test("error message uses 'global profile' when scope is global", async () => {
      resolveScopeMock.mockReturnValue(globalScope);
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig("missing-env")).toThrow(/global profile.*\/home\/user\/\.config\/tagoio/);
    });

    test("error message names the resolved scope when default env is missing from config", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(configFile));
      process.env.TAGOIO_DEFAULT = "not-there";
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { getEnvironmentConfig } = await import("./config-file.js");
      expect(() => getEnvironmentConfig()).toThrow(/Default Environment 'not-there' not found in local profile/);
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
    test("writes the provided config object to disk at the resolved config path", async () => {
      const { writeToConfigFile } = await import("./config-file.js");
      writeToConfigFile({ default: "prod", analysisPath: "x", buildPath: "y" } as never);

      const [filePath] = writeFileSyncMock.mock.calls[writeFileSyncMock.mock.calls.length - 1];
      expect(filePath).toBe("/repo/tagoconfig.json");
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

    test("error message names the resolved scope when target env is missing", async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify({ default: "prod" }));
      errorHandlerMock.mockImplementation((str: unknown) => {
        throw new Error(String(str));
      });

      const { setDefault } = await import("./config-file.js");
      expect(() => setDefault("ghost")).toThrow(/'ghost' is not in local profile/);
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
