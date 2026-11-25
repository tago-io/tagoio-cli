import type { DashboardInfo } from "@tago-io/sdk";

type Placement = NonNullable<DashboardInfo["arrangement"]>[number];

interface PlacementRequest {
  widgetID: string;
  tab: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * The dashboard grid is 4 columns wide. A custom widget is usually a whole
 * screen of an application, so it takes the full width by default, and a
 * height of 6 (about 480 px) rather than the platform's 2, which suits a
 * single number and little else.
 */
const DEFAULT_WIDTH = 4;
const DEFAULT_HEIGHT = 6;

/**
 * @description Picks the tab a new widget goes on. A requested tab must exist;
 * without one, a dashboard with tabs uses its first, since a widget with no tab
 * on a tabbed dashboard shows on none of them.
 *
 * Returns the tab key, or `null` for a dashboard without tabs, or an error
 * message naming the keys that exist.
 */
function resolveTab(tabs: { key: string }[], requested: string | undefined): { tab: string | null } | { error: string } {
  if (requested !== undefined) {
    if (tabs.some((tab) => tab.key === requested)) {
      return { tab: requested };
    }
    const keys = tabs.map((tab) => tab.key);
    return { error: `Tab "${requested}" is not on this dashboard. ${keys.length ? `Use one of: ${keys.join(", ")}.` : "The dashboard has no tabs."}` };
  }
  return { tab: tabs[0]?.key ?? null };
}

/**
 * @description Adds a widget to the arrangement. By default it goes below
 * everything already on its tab, at full width.
 *
 * The API replaces the arrangement as a whole, so the caller sends the full
 * array this returns, never just the new entry.
 */
function placeWidget(arrangement: Placement[], request: PlacementRequest): Placement[] {
  const sameTab = arrangement.filter((entry) => (entry.tab ?? null) === request.tab);
  const bottom = sameTab.reduce((lowest, entry) => Math.max(lowest, entry.y + entry.height), 0);
  const entry: Placement = {
    widget_id: request.widgetID,
    x: request.x ?? 0,
    y: request.y ?? bottom,
    width: request.width ?? DEFAULT_WIDTH,
    height: request.height ?? DEFAULT_HEIGHT,
    ...(request.tab ? { tab: request.tab } : {}),
  };
  return [...arrangement, entry];
}

/** The grid's width in columns. */
const GRID_COLUMNS = 4;

/**
 * @description Checks a requested position against the 4-column grid, offline.
 * Fractions are valid, as in the Admin; a widget must fit inside the grid.
 */
function checkPlacement(request: { x?: number; y?: number; width?: number; height?: number }): string | undefined {
  const { x = 0, y = 0, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = request;
  if (x < 0 || y < 0) {
    return "--x and --y cannot be negative.";
  }
  if (width <= 0 || height <= 0) {
    return "--width and --height must be greater than 0.";
  }
  if (x + width > GRID_COLUMNS) {
    return `The widget does not fit: the grid is ${GRID_COLUMNS} columns wide, and --x ${x} plus --width ${width} is ${x + width}.`;
  }
  return undefined;
}

function removeWidget(arrangement: Placement[], widgetID: string): Placement[] {
  return arrangement.filter((entry) => entry.widget_id !== widgetID);
}

/**
 * @description Moves a widget to another tab or position. Staying on its tab,
 * it keeps whatever was not asked to change; moving to another tab, it goes
 * below that tab's last widget unless a position is given. Its size is kept in
 * both cases.
 */
function moveWidget(arrangement: Placement[], request: PlacementRequest): { arrangement: Placement[]; entry: Placement } {
  const current = arrangement.find((entry) => entry.widget_id === request.widgetID);
  const sameTab = current !== undefined && (current.tab ?? null) === request.tab;
  const next = placeWidget(removeWidget(arrangement, request.widgetID), {
    widgetID: request.widgetID,
    tab: request.tab,
    x: request.x ?? (sameTab ? current.x : undefined),
    y: request.y ?? (sameTab ? current.y : undefined),
    width: request.width ?? current?.width,
    height: request.height ?? current?.height,
  });
  return { arrangement: next, entry: next[next.length - 1] };
}

export { checkPlacement, DEFAULT_HEIGHT, DEFAULT_WIDTH, moveWidget, placeWidget, removeWidget, resolveTab };
export type { Placement, PlacementRequest };
