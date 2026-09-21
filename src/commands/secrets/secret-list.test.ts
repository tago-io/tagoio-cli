import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string): void => {
  throw new Error(`json:${code}:${message}`);
});

const secretsListMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { secrets: { list: (...args: unknown[]) => secretsListMock(...args) } };
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

/**
 * `secrets.list` does not run the SDK's dateParser, so the API's raw ISO
 * strings come through untouched — unlike `info`, which returns Date objects.
 * The fixture reflects what `list` actually sends.
 */
const sampleSecret = {
  id: "sec1",
  key: "TWILIO_SID",
  tags: [{ key: "env", value: "prod" }],
  value_length: 34,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("secretList", () => {
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

    const { secretList } = await import("./secret-list.js");
    await expect(secretList({} as never)).rejects.toThrow(/Environment not found/);
  });

  test("requests the fields the listing renders", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({} as never);

    expect(secretsListMock.mock.calls[0][0]).toMatchObject({
      amount: 100,
      fields: ["id", "key", "tags", "value_length", "created_at", "updated_at"],
    });
  });

  test("--amount overrides the default", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({ amount: 5 } as never);

    expect(secretsListMock.mock.calls[0][0].amount).toBe(5);
  });

  /**
   * `SecretsQuery` declares only `key` as filterable, but the API honours a tag
   * filter too — verified against a live profile, where filtering on one tag
   * returned 1 of 2 secrets. Every other family exposes -k/-v, so leaving it
   * out here would make secrets the odd one out.
   */
  test("sends exactly the tag pairs given, with no trailing empty entry", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({ tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(secretsListMock.mock.calls[0][0].filter.tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("pairs multiple tags by index", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({ tagkey: ["env", "team"], tagvalue: ["prod", "core"] } as never);

    expect(secretsListMock.mock.calls[0][0].filter.tags).toEqual([
      { key: "env", value: "prod" },
      { key: "team", value: "core" },
    ]);
  });

  test("omits the tag filter entirely when no tags are given", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({} as never);

    expect(secretsListMock.mock.calls[0][0].filter.tags).toBeUndefined();
  });

  test("a tag filter combines with --key", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({ key: "twilio", tagkey: ["env"], tagvalue: ["prod"] } as never);

    const filter = secretsListMock.mock.calls[0][0].filter;
    expect(filter.key).toBe("*twilio*");
    expect(filter.tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("wraps --key in wildcards", async () => {
    secretsListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({ key: "twilio" } as never);

    expect(secretsListMock.mock.calls[0][0].filter.key).toBe("*twilio*");
  });

  /**
   * The named trap. `secrets.list` skips the SDK's dateParser while
   * `secrets.info` runs it, so `created_at` is a string here and a Date there,
   * even though SecretsInfo types both as Date. `mapDate` calls
   * `.toISOString()` unguarded, so a string reaching it throws TypeError —
   * exactly how `last_triggered: "never"` broke action-list.
   */
  test("renders the ISO string dates that list returns, without throwing", async () => {
    secretsListMock.mockResolvedValue([sampleSecret]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await expect(secretList({} as never)).resolves.not.toThrow();
  });

  test("renders a Date too, since info-shaped records reach the same helper", async () => {
    secretsListMock.mockResolvedValue([{ ...sampleSecret, created_at: new Date("2026-01-01T00:00:00Z") }]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await expect(secretList({} as never)).resolves.not.toThrow();
  });

  test("a missing date renders without throwing", async () => {
    secretsListMock.mockResolvedValue([{ ...sampleSecret, created_at: undefined, updated_at: null }]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await expect(secretList({} as never)).resolves.not.toThrow();
  });

  test("--json emits one compact line carrying value_length", async () => {
    secretsListMock.mockResolvedValue([sampleSecret]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { secretList } = await import("./secret-list.js");
    await secretList({ json: true } as never);

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(payload[0].value_length).toBe(34);
  });

  // The API never returns a value; nothing here should invent one.
  test("--json output carries no value key", async () => {
    secretsListMock.mockResolvedValue([sampleSecret]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { secretList } = await import("./secret-list.js");
    await secretList({ json: true } as never);

    expect("value" in JSON.parse(String(stdoutSpy.mock.calls[0][0]))[0]).toBe(false);
  });

  test("--stringify pretty-prints", async () => {
    secretsListMock.mockResolvedValue([sampleSecret]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { secretList } = await import("./secret-list.js");
    await secretList({ stringify: true } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });

  test("human mode collapses tags to a count, never [object Object]", async () => {
    secretsListMock.mockResolvedValue([sampleSecret]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({} as never);

    expect(JSON.stringify(tableSpy.mock.calls[0][0])).not.toContain("[object Object]");
  });

  test("returns without output when the request fails", async () => {
    secretsListMock.mockRejectedValue(new Error("api down"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { secretList } = await import("./secret-list.js");
    await secretList({} as never);
  });
});
