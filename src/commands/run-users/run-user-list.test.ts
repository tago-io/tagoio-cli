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

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

describe("runUserList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const userList = [
    {
      id: "usr1",
      name: "Mateus Silva",
      email: "mateus.silva@tago.io",
      active: true,
      last_login: new Date("2026-08-06T20:46:40.238Z"),
      created_at: new Date("2026-07-01T13:21:48.402Z"),
      tags: [{ key: "access", value: "admin" }],
    },
  ];

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    resourcesInstance.run.listUsers.mockResolvedValue(userList);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { runUserList } = await import("./run-user-list.js");
    await expect(runUserList({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  // The SDK default is 20, so the wider default has to be passed explicitly.
  test("requests 100 users by default", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].amount).toBe(100);
  });

  test("--amount overrides the default", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ amount: 5, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].amount).toBe(5);
  });

  test("requests the fields the listing renders", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].fields).toEqual(["id", "name", "email", "active", "last_login", "created_at", "tags"]);
  });

  test("--json emits a clean array", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ id: "usr1", email: "mateus.silva@tago.io" });
  });

  test("--stringify pretty-prints", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ stringify: true, tagkey: [], tagvalue: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });

  test("the default view uses console.table and writes nothing to stdout", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ tagkey: [], tagvalue: [] } as never);

    expect(tableSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  /**
   * Probed against a live profile: `listUsers` runs the SDK's `dateParser`, so
   * both this and `userInfo` return real `Date` objects — unlike
   * `secrets.list`, which returns strings and broke `mapDate` in #45. Pinned
   * because this series got the equivalent assumption wrong twice, and being
   * wrong again means a TypeError in the field.
   */
  test("a Date created_at renders without throwing", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed[0].created_at).toBeTruthy();
  });

  /** `last_login` is null for a user who has never signed in. */
  test("a null last_login renders as never, with the key present", async () => {
    resourcesInstance.run.listUsers.mockResolvedValue([{ ...userList[0], last_login: null }]);

    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(parsed[0].last_login).toBe("never");
  });

  test("--name filters with a wrapped partial", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ name: "Mateus", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].filter.name).toBe("*Mateus*");
  });

  test("--email filters with a wrapped partial", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ email: "+test", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].filter.email).toBe("*+test*");
  });

  test("--active filters on the active state", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ active: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].filter.active).toBe(true);
  });

  test("--inactive filters on the inactive state", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ inactive: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].filter.active).toBe(false);
  });

  test("--active and --inactive together fail before any call", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await expect(runUserList({ active: true, inactive: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.run.listUsers).not.toHaveBeenCalled();
  });

  test("-k and -v reach the tag filter", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ tagkey: ["access"], tagvalue: ["admin"] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].filter.tags).toEqual([{ key: "access", value: "admin" }]);
  });

  test("--order-by and --order reach the query", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ orderBy: "last_login", order: "desc", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].orderBy).toEqual(["last_login", "desc"]);
  });

  test("--order-by defaults to ascending", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await runUserList({ orderBy: "name", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.listUsers.mock.calls[0][0].orderBy).toEqual(["name", "asc"]);
  });

  /**
   * Probed: `orderBy: ["email","asc"]` returns `Invalid orderBy parameter`,
   * which names neither the offending field nor the valid set. `email` is
   * filterable but not orderable — an asymmetry nothing in the types shows.
   */
  test("an unorderable field fails offline, before any call", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await expect(runUserList({ orderBy: "email", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order_by/);

    expect(resourcesInstance.run.listUsers).not.toHaveBeenCalled();
  });

  test("the rejection names the fields that are allowed", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await expect(runUserList({ orderBy: "email", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/last_login/);
  });

  test("an invalid --order value fails offline", async () => {
    const { runUserList } = await import("./run-user-list.js");
    await expect(runUserList({ orderBy: "name", order: "sideways", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.run.listUsers.mockRejectedValue(new Error("boom"));

    const { runUserList } = await import("./run-user-list.js");
    await expect(runUserList({ json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/json:|boom/);
  });
});
