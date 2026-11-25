import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

describe("parseTabs", () => {
  test("returns undefined without --tab or --tabs, so the tabs are left alone", async () => {
    const { parseTabs } = await import("./dashboard-payload.js");

    expect(parseTabs({})).toBeUndefined();
    expect(parseTabs({ tab: [] })).toBeUndefined();
  });

  test("splits key=Label on the first = and uses the key as label when there is none", async () => {
    const { parseTabs } = await import("./dashboard-payload.js");

    expect(parseTabs({ tab: ["main=Overview", "map", "a=b=c"] })).toEqual([
      { key: "main", value: "Overview" },
      { key: "map", value: "map" },
      { key: "a", value: "b=c" },
    ]);
  });

  test("an empty key or label fails offline", async () => {
    const { parseTabs } = await import("./dashboard-payload.js");

    expect(() => parseTabs({ tab: ["=Overview"] })).toThrow(/invalid_tab/);
    expect(() => parseTabs({ tab: ["main="] })).toThrow(/invalid_tab/);
  });

  test("a repeated key fails, since widgets are placed by tab key", async () => {
    const { parseTabs } = await import("./dashboard-payload.js");

    expect(() => parseTabs({ tab: ["main=A", "main=B"] })).toThrow(/"main" is used more than once/);
    expect(() => parseTabs({ tabs: '[{"key":"x","value":"A"},{"key":"x","value":"B"}]' })).toThrow(/"x" is used more than once/);
  });

  test("--tabs carries a tab type and the other fields as given", async () => {
    const { parseTabs } = await import("./dashboard-payload.js");
    const tabs = [
      { key: "app", value: "App", type: "single_widget" },
      { key: "create", value: "Hidden", type: "hidden" },
    ];

    expect(parseTabs({ tabs: JSON.stringify(tabs) })).toEqual(tabs);
  });

  test("--tabs needs a key and a value on each tab, and conflicts with --tab", async () => {
    const { parseTabs } = await import("./dashboard-payload.js");

    expect(() => parseTabs({ tabs: '[{"value":"App"}]' })).toThrow(/Invalid tab 1: expected an object with "key" and "value"/);
    expect(() => parseTabs({ tabs: "[]", tab: ["main"] })).toThrow(/conflicting_flags/);
  });
});

describe("parseBlueprintDevices", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "blueprint-devices-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads the slots inline or from a file", async () => {
    const slots = [{ name: "customer", type: "device", conditions: [{ key: "device_type", value: "customer" }] }];
    const file = join(dir, "slots.json");
    writeFileSync(file, JSON.stringify(slots));
    const { parseBlueprintDevices } = await import("./dashboard-payload.js");

    expect(parseBlueprintDevices({ blueprintDevices: JSON.stringify(slots) })).toEqual(slots);
    expect(parseBlueprintDevices({ blueprintDevicesFile: file })).toEqual(slots);
  });

  test("a non-array value fails with the flag name", async () => {
    const { parseBlueprintDevices } = await import("./dashboard-payload.js");

    expect(() => parseBlueprintDevices({ blueprintDevices: '{"name":"x"}' })).toThrow(/--blueprint-devices must be a JSON array/);
  });

  test("inline and file together fail", async () => {
    const { parseBlueprintDevices } = await import("./dashboard-payload.js");

    expect(() => parseBlueprintDevices({ blueprintDevices: "[]", blueprintDevicesFile: "x.json" })).toThrow(/conflicting_flags/);
  });
});

describe("parseIcon", () => {
  test("expands an icon name to the Admin's icon URL and keeps an https URL as given", async () => {
    const { parseIcon } = await import("./dashboard-payload.js");

    expect(parseIcon({})).toBeUndefined();
    expect(parseIcon({ icon: "wifi", iconColor: "#8a3120" })).toEqual({ url: "https://svg.internal.tago.io/wifi.svg", color: "#8a3120" });
    expect(parseIcon({ icon: "https://example.com/pump.svg" })).toEqual({ url: "https://example.com/pump.svg" });
    expect(parseIcon({ iconColor: "#FFF" })).toEqual({ color: "#FFF" });
  });

  test.each([
    [{ icon: "wifi.svg" }, /invalid_icon/],
    [{ icon: "http://example.com/a.svg" }, /invalid_icon/],
    [{ icon: "wifi", iconColor: "red" }, /invalid_icon_color/],
    [{ icon: "wifi", iconColor: "#12345" }, /invalid_icon_color/],
  ])("refuses %o", async (options, message) => {
    const { parseIcon } = await import("./dashboard-payload.js");

    expect(() => parseIcon(options)).toThrow(message);
  });
});
