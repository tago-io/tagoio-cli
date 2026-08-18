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

describe("accessManagementList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const policyList = [
    {
      id: "acc1",
      name: "[TagoIO] - All Users access policy",
      active: true,
      created_at: new Date("2026-07-01T13:19:03.000Z"),
      tags: [{ key: "export_id", value: "all_users" }],
    },
  ];

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    resourcesInstance.accessManagement.list.mockResolvedValue(policyList);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { accessManagementList } = await import("./access-management-list.js");
    await expect(accessManagementList({ tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  /**
   * The single most important assertion in this family.
   *
   * Probed against a live profile: asking a listing for `permissions` or
   * `targets` makes the API answer "Sorry, Internal Error" — a 500, not an
   * omitted field. Every mock test would stay green if someone added either to
   * this array, and the command would break against every real profile.
   */
  test("requests exactly the five safe fields", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].fields).toEqual(["id", "name", "active", "created_at", "tags"]);
  });

  test("never asks a listing for permissions or targets", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ tagkey: [], tagvalue: [] } as never);

    const fields: string[] = resourcesInstance.accessManagement.list.mock.calls[0][0].fields;
    expect(fields).not.toContain("permissions");
    expect(fields).not.toContain("targets");
  });

  test("requests 100 policies by default", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].amount).toBe(100);
  });

  test("--amount overrides the default", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ amount: 5, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].amount).toBe(5);
  });

  test("--json emits a clean array", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ json: true, tagkey: [], tagvalue: [] } as never);

    const parsed = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ id: "acc1" });
  });

  test("--stringify pretty-prints", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ stringify: true, tagkey: [], tagvalue: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).toContain("\n  ");
  });

  test("the default view uses console.table and writes nothing to stdout", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ tagkey: [], tagvalue: [] } as never);

    expect(tableSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("a Date created_at renders without throwing", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ json: true, tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))[0].created_at).toBeTruthy();
  });

  test("--name filters with a wrapped partial", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ name: "All Users", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].filter.name).toBe("*All Users*");
  });

  test("--active filters on the active state", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ active: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].filter.active).toBe(true);
  });

  test("--inactive filters on the inactive state", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ inactive: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].filter.active).toBe(false);
  });

  test("--active and --inactive together fail before any call", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await expect(accessManagementList({ active: true, inactive: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.accessManagement.list).not.toHaveBeenCalled();
  });

  test("-k and -v reach the tag filter", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ tagkey: ["cli_test"], tagvalue: ["1"] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].filter.tags).toEqual([{ key: "cli_test", value: "1" }]);
  });

  test("--order-by and --order reach the query", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await accessManagementList({ orderBy: "created_at", order: "desc", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.accessManagement.list.mock.calls[0][0].orderBy).toEqual(["created_at", "desc"]);
  });

  /**
   * `AccessQuery` declares four orderable fields. Probed: `permissions` fails
   * with a bare `Invalid orderBy parameter`, naming neither the field nor the
   * valid set.
   */
  test("an unorderable field fails offline, naming the valid set", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await expect(accessManagementList({ orderBy: "permissions", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order_by/);
    await expect(accessManagementList({ orderBy: "permissions", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/updated_at/);

    expect(resourcesInstance.accessManagement.list).not.toHaveBeenCalled();
  });

  test("an invalid --order value fails offline", async () => {
    const { accessManagementList } = await import("./access-management-list.js");
    await expect(accessManagementList({ orderBy: "name", order: "sideways", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_order/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.accessManagement.list.mockRejectedValue(new Error("boom"));

    const { accessManagementList } = await import("./access-management-list.js");
    await expect(accessManagementList({ json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/json:|boom/);
  });
});
