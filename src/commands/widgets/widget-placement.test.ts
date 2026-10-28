import { describe, expect, test } from "vitest";

import { checkPlacement, moveWidget, placeWidget, removeWidget, resolveTab } from "./widget-placement.js";

const ARRANGEMENT = [
  { widget_id: "a", x: 0, y: 0, width: 4, height: 3, tab: "main" },
  { widget_id: "b", x: 0, y: 3, width: 2, height: 5, tab: "main" },
  { widget_id: "c", x: 0, y: 0, width: 4, height: 10, tab: "other" },
];

describe("placeWidget", () => {
  test("goes below the tab's lowest widget, full width, and keeps the rest of the arrangement", () => {
    const next = placeWidget(ARRANGEMENT, { widgetID: "new", tab: "main" });

    expect(next.slice(0, 3)).toEqual(ARRANGEMENT);
    expect(next[3]).toEqual({ widget_id: "new", x: 0, y: 8, width: 4, height: 6, tab: "main" });
  });

  test("honors an explicit position and leaves tab out for a dashboard without tabs", () => {
    const [entry] = placeWidget([], { widgetID: "new", tab: null, x: 2, y: 1, width: 2, height: 4 });

    expect(entry).toEqual({ widget_id: "new", x: 2, y: 1, width: 2, height: 4 });
  });
});

describe("resolveTab", () => {
  test("uses the first tab when none is asked for, and null without tabs", () => {
    expect(resolveTab([{ key: "main" }, { key: "other" }], undefined)).toEqual({ tab: "main" });
    expect(resolveTab([], undefined)).toEqual({ tab: null });
  });

  test("an unknown tab names the keys that exist", () => {
    expect(resolveTab([{ key: "main" }], "map")).toEqual({ error: 'Tab "map" is not on this dashboard. Use one of: main.' });
  });
});

describe("removeWidget", () => {
  test("drops only the given widget", () => {
    expect(removeWidget(ARRANGEMENT, "b").map((entry) => entry.widget_id)).toEqual(["a", "c"]);
  });
});

describe("moveWidget", () => {
  test("to another tab: goes below that tab's widgets and keeps its size", () => {
    const { arrangement, entry } = moveWidget(ARRANGEMENT, { widgetID: "b", tab: "other" });

    expect(entry).toEqual({ widget_id: "b", x: 0, y: 10, width: 2, height: 5, tab: "other" });
    expect(arrangement.filter((item) => item.widget_id === "b")).toHaveLength(1);
  });

  test("on the same tab: keeps its position and changes only what was asked", () => {
    const { entry } = moveWidget(ARRANGEMENT, { widgetID: "b", tab: "main", height: 9 });

    expect(entry).toEqual({ widget_id: "b", x: 0, y: 3, width: 2, height: 9, tab: "main" });
  });

  test("a widget missing from the arrangement gets placed", () => {
    const { entry } = moveWidget(ARRANGEMENT, { widgetID: "new", tab: "other" });

    expect(entry).toEqual({ widget_id: "new", x: 0, y: 10, width: 4, height: 6, tab: "other" });
  });
});

describe("checkPlacement", () => {
  test("accepts fractions inside the grid and refuses what does not fit", () => {
    expect(checkPlacement({ x: 0.5, width: 3.5 })).toBeUndefined();
    expect(checkPlacement({ x: -1 })).toMatch(/cannot be negative/);
    expect(checkPlacement({ height: 0 })).toMatch(/greater than 0/);
    expect(checkPlacement({ x: 3, width: 2 })).toMatch(/does not fit/);
  });
});
