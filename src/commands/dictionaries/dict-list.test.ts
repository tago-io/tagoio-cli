import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string): void => {
  throw new Error(`json:${code}:${message}`);
});

const dictionariesListMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { dictionaries: { list: (...args: unknown[]) => dictionariesListMock(...args) } };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  successMSG: vi.fn(),
}));

const sampleDictionary = {
  id: "dic1",
  name: "Portal Strings",
  slug: "PORTAL",
  fallback: "en-US",
  languages: [
    { code: "en-US", active: true },
    { code: "pt-BR", active: true },
  ],
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
};

describe("dictList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock.mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { dictList } = await import("./dict-list.js");
    await expect(dictList({} as never)).rejects.toThrow(/Environment not found/);
  });

  test("requests the fields the listing renders", async () => {
    dictionariesListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { dictList } = await import("./dict-list.js");
    await dictList({} as never);

    expect(dictionariesListMock.mock.calls[0][0]).toMatchObject({
      amount: 100,
      fields: ["id", "name", "slug", "fallback", "languages", "created_at", "updated_at"],
    });
  });

  test("--amount overrides the default", async () => {
    dictionariesListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { dictList } = await import("./dict-list.js");
    await dictList({ amount: 5 } as never);

    expect(dictionariesListMock.mock.calls[0][0].amount).toBe(5);
  });

  test("wraps --name in wildcards", async () => {
    dictionariesListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { dictList } = await import("./dict-list.js");
    await dictList({ name: "portal" } as never);

    expect(dictionariesListMock.mock.calls[0][0].filter.name).toBe("*portal*");
  });

  test("--json emits one compact line with the languages array intact", async () => {
    dictionariesListMock.mockResolvedValue([sampleDictionary]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { dictList } = await import("./dict-list.js");
    await dictList({ json: true } as never);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload).toHaveLength(1);
    expect(payload[0].languages).toEqual(sampleDictionary.languages);
  });

  test("--stringify pretty-prints", async () => {
    dictionariesListMock.mockResolvedValue([sampleDictionary]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { dictList } = await import("./dict-list.js");
    await dictList({ stringify: true } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });

  /**
   * A dictionary's languages are objects. Rendered straight into a table cell
   * they collapse to "[object Object]", so human mode shows the codes.
   */
  test("human mode renders language codes, never [object Object]", async () => {
    dictionariesListMock.mockResolvedValue([sampleDictionary]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { dictList } = await import("./dict-list.js");
    await dictList({} as never);

    const rendered = JSON.stringify(tableSpy.mock.calls[0][0]);
    expect(rendered).not.toContain("[object Object]");
    expect(rendered).toContain("en-US");
    expect(rendered).toContain("pt-BR");
  });

  test("a dictionary with no languages renders without crashing", async () => {
    dictionariesListMock.mockResolvedValue([{ ...sampleDictionary, languages: undefined }]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { dictList } = await import("./dict-list.js");
    await expect(dictList({} as never)).resolves.not.toThrow();
    expect(tableSpy).toHaveBeenCalled();
  });

  test("returns without output when the request fails", async () => {
    dictionariesListMock.mockRejectedValue(new Error("api down"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { dictList } = await import("./dict-list.js");
    await dictList({} as never);
  });
});
