import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

const devicesListMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return {
      devices: { list: (...args: unknown[]) => devicesListMock(...args) },
    };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: vi.fn(),
}));

describe("deviceList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock.mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
  });

  test("calls errorHandler when environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { deviceList } = await import("./device-list.js");
    await expect(
      deviceList({ tagkey: [], tagvalue: [] } as never)
    ).rejects.toThrow(/Environment not found/);
  });

  test("returns silently when device list fetch fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    devicesListMock.mockRejectedValue(new Error("api down"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { deviceList } = await import("./device-list.js");
    await deviceList({ tagkey: [], tagvalue: [] } as never);
  });

  test("prints table for devices when stringify/json are not set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    devicesListMock.mockResolvedValue([
      { id: "d1", name: "Dev 1", active: true, last_input: new Date("2026-01-01T00:00:00Z"), tags: [] },
    ]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { deviceList } = await import("./device-list.js");
    await deviceList({ tagkey: [], tagvalue: [] } as never);
    expect(tableSpy).toHaveBeenCalled();
    tableSpy.mockRestore();
  });

  test("uses JSON.stringify when options.stringify is true", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    devicesListMock.mockResolvedValue([
      { id: "d1", name: "Dev 1", active: true, last_input: null, tags: [{ key: "env", value: "prod" }] },
    ]);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { deviceList } = await import("./device-list.js");
    await deviceList({ tagkey: [], tagvalue: [], stringify: true } as never);
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  test("uses console.dir when options.json is true", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    devicesListMock.mockResolvedValue([
      { id: "d1", name: "Dev", active: true, last_input: null, tags: [] },
    ]);
    const dirSpy = vi.spyOn(console, "dir").mockImplementation(() => undefined);

    const { deviceList } = await import("./device-list.js");
    await deviceList({ tagkey: [], tagvalue: [], json: true } as never);
    expect(dirSpy).toHaveBeenCalled();
    dirSpy.mockRestore();
  });

  test("applies name filter and repeatable tag filters", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    devicesListMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { deviceList } = await import("./device-list.js");
    await deviceList({
      tagkey: ["env", "zone"],
      tagvalue: ["prod", "us-east"],
      name: "sensor",
    } as never);

    const calledWith = devicesListMock.mock.calls[0][0];
    expect(calledWith.filter.name).toBe("*sensor*");
    expect(calledWith.filter.tags.length).toBeGreaterThan(0);
  });
});

describe("mapTags", () => {
  test("returns tag objects untouched when opt.raw is true", async () => {
    const { mapTags } = await import("./device-list.js");
    const tags = [{ key: "k", value: "v" }];
    expect(mapTags(tags, { raw: true })).toBe(tags);
  });

  test("collapses tags to an array of single-key objects when not raw", async () => {
    const { mapTags } = await import("./device-list.js");
    const tags = [
      { key: "env", value: "prod" },
      { key: "zone", value: "us-east" },
    ];
    expect(mapTags(tags, {})).toEqual([{ env: "prod" }, { zone: "us-east" }]);
  });
});

describe("mapDate", () => {
  test("returns undefined when the date is null", async () => {
    const { mapDate } = await import("./device-list.js");
    expect(mapDate(null, {})).toBeUndefined();
  });

  test("returns the ISO string when opt.raw is true", async () => {
    const { mapDate } = await import("./device-list.js");
    const d = new Date("2026-04-21T12:00:00Z");
    expect(mapDate(d, { raw: true })).toBe("2026-04-21T12:00:00.000Z");
  });

  test("returns a locale-formatted string when not raw", async () => {
    const { mapDate } = await import("./device-list.js");
    const d = new Date("2026-04-21T12:00:00Z");
    const formatted = mapDate(d, {});
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe("string");
  });
});
