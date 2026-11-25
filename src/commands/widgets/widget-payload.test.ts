import { describe, expect, test, vi } from "vitest";

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
}));

describe("parseParams", () => {
  test("splits on the first = so values keep their own", async () => {
    const { parseParams } = await import("./widget-payload.js");

    expect(parseParams(["view_type=viewer", "url=https://x.io/?a=b"], {})).toEqual([
      { key: "view_type", value: "viewer" },
      { key: "url", value: "https://x.io/?a=b" },
    ]);
    expect(parseParams([], {})).toBeUndefined();
  });

  test("a pair without a key fails", async () => {
    const { parseParams } = await import("./widget-payload.js");

    expect(() => parseParams(["=x"], {})).toThrow(/invalid_param/);
    expect(() => parseParams(["novalue"], {})).toThrow(/invalid_param/);
  });
});

describe("parseData", () => {
  test("--clear-data sends an empty list and conflicts with --data", async () => {
    const { parseData } = await import("./widget-payload.js");

    expect(parseData({ clearData: true })).toEqual([]);
    expect(() => parseData({ clearData: true, data: "[]" })).toThrow(/conflicting_flags/);
  });

  test("forwards the data sources as given", async () => {
    const { parseData } = await import("./widget-payload.js");
    const data = [{ origin: "6a91f697b1ccff000c3eb271", variables: ["temperature"], qty: 10 }];

    expect(parseData({ data: JSON.stringify(data) })).toEqual(data);
    expect(parseData({})).toBeUndefined();
  });
});

describe("parseMaxData", () => {
  test("passes a positive whole number and leaves an absent flag undefined", async () => {
    const { parseMaxData } = await import("./widget-payload.js");

    expect(parseMaxData({ maxData: 2500 })).toBe(2500);
    expect(parseMaxData({})).toBeUndefined();
  });

  test.each([0, -1, 2.5])("refuses %s", async (maxData) => {
    const { parseMaxData } = await import("./widget-payload.js");

    expect(() => parseMaxData({ maxData })).toThrow(/invalid_max_data/);
  });
});

describe("parseEntitySources", () => {
  test("reads the sources, or an empty list to clear them", async () => {
    const { parseEntitySources } = await import("./widget-payload.js");

    expect(parseEntitySources({})).toBeUndefined();
    expect(parseEntitySources({ clearEntitySource: true })).toEqual([]);
    expect(parseEntitySources({ entitySource: '[{"id":"slot","view":["notes"]}]' })?.[0]).toMatchObject({ id: "slot", type: "entity", view: ["notes"] });
  });

  test("a source and its clear flag together fail", async () => {
    const { parseEntitySources } = await import("./widget-payload.js");

    expect(() => parseEntitySources({ entitySource: "[]", clearEntitySource: true })).toThrow(/conflicting_flags/);
  });
});

describe("parseFilters", () => {
  test("only the sections with a flag appear, and a clear flag empties one", async () => {
    const { parseFilters } = await import("./widget-payload.js");
    const filters = parseFilters({
      userFilter: JSON.stringify([{ filters: [{ tag_key: "role", tag_value: "admin" }], data: [{ type: "parameter", parameter: "email" }] }]),
      clearEntityFilter: true,
    });

    expect(Object.keys(filters ?? {})).toEqual(["user", "entity"]);
    expect(filters?.entity).toEqual([]);
    expect(filters?.user?.[0].filters[0]).toMatchObject({ tag_key: "role", tag_value: "admin" });
  });

  test("returns undefined without filter flags", async () => {
    const { parseFilters } = await import("./widget-payload.js");

    expect(parseFilters({})).toBeUndefined();
  });

  test("a filter and its clear flag together fail", async () => {
    const { parseFilters } = await import("./widget-payload.js");

    expect(() => parseFilters({ deviceFilter: "[]", clearDeviceFilter: true })).toThrow(/--device-filter and --clear-device-filter/);
  });
});
