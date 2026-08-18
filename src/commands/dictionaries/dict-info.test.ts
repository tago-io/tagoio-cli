import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});
const pickDictionaryIDMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

// infoMSG and writeStatus keep their real stderr behaviour so the tests can
// prove human output never reaches stdout.
vi.mock("../../lib/messages.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/messages.js")>();
  return { ...actual, errorHandler: errorHandlerMock, errorHandlerJSON: errorHandlerJSONMock };
});

vi.mock("../../prompt/pick-dictionary-id-from-tagoio.js", () => ({
  pickDictionaryIDFromTagoIO: pickDictionaryIDMock,
}));

const sampleInfo = {
  id: "dic1",
  name: "Portal Strings",
  slug: "PORTAL",
  fallback: "en-US",
  languages: [
    { code: "en-US", active: true },
    { code: "pt-BR", active: false },
  ],
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
};

describe("dictInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickDictionaryIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { dictInfo } = await import("./dict-info.js");
    await expect(dictInfo("dic1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("uses the picker when no id is given", async () => {
    pickDictionaryIDMock.mockResolvedValue("picked1");
    resourcesInstance.dictionaries.info.mockResolvedValue(sampleInfo);

    const { dictInfo } = await import("./dict-info.js");
    await dictInfo(undefined, {} as never);

    expect(resourcesInstance.dictionaries.info).toHaveBeenCalledWith("picked1");
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { dictInfo } = await import("./dict-info.js");
    await expect(dictInfo(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickDictionaryIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.dictionaries.info).not.toHaveBeenCalled();
  });

  test("--json emits the whole dictionary with languages intact", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue(sampleInfo);

    const { dictInfo } = await import("./dict-info.js");
    await dictInfo("dic1", { json: true } as never);

    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload.languages).toEqual(sampleInfo.languages);
    expect(payload.slug).toBe("PORTAL");
  });

  /**
   * The API omits `id` from the dictionary payload, unlike actions and devices.
   * The command knows the id it asked for, so it fills it in — otherwise
   * `dict-info --json` gives a caller no way to identify what it just read.
   */
  test("--json always carries the id, which the API omits", async () => {
    const { id: _omitted, ...withoutId } = sampleInfo;
    resourcesInstance.dictionaries.info.mockResolvedValue(withoutId);

    const { dictInfo } = await import("./dict-info.js");
    await dictInfo("dic1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).id).toBe("dic1");
  });

  test("--raw keeps dates as ISO strings", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue(sampleInfo);

    const { dictInfo } = await import("./dict-info.js");
    await dictInfo("dic1", { json: true, raw: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  /**
   * `console.table` writes to stdout. `action-info` shipped that leak and only
   * a functional test caught it, so this asserts against the real function
   * rather than a mock that would hide it.
   */
  test("human mode writes nothing to stdout", async () => {
    vi.restoreAllMocks();
    resourcesInstance.dictionaries.info.mockResolvedValue(sampleInfo);
    const localStdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { dictInfo } = await import("./dict-info.js");
    await dictInfo("dic1", {} as never);

    expect(localStdout).not.toHaveBeenCalled();
  });

  test("human mode renders the languages on stderr, never as [object Object]", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue(sampleInfo);

    const { dictInfo } = await import("./dict-info.js");
    await dictInfo("dic1", {} as never);

    const written = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("");
    expect(written).not.toContain("[object Object]");
    expect(written).toContain("en-US");
    expect(written).toContain("pt-BR");
  });

  test("a dictionary with no languages renders without crashing", async () => {
    resourcesInstance.dictionaries.info.mockResolvedValue({ ...sampleInfo, languages: undefined });

    const { dictInfo } = await import("./dict-info.js");
    await expect(dictInfo("dic1", {} as never)).resolves.not.toThrow();
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.dictionaries.info.mockRejectedValue(new Error("no such dictionary"));

    const { dictInfo } = await import("./dict-info.js");
    await expect(dictInfo("nope", {} as never)).rejects.toThrow(/not_found|no such dictionary/);
  });

  test("an unknown id reports through the JSON channel when --json is set", async () => {
    resourcesInstance.dictionaries.info.mockRejectedValue(new Error("no such dictionary"));

    const { dictInfo } = await import("./dict-info.js");
    await expect(dictInfo("nope", { json: true } as never)).rejects.toThrow(/^json:not_found:/);
  });
});
