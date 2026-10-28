import { readJSONFlagSource } from "../../lib/json-flag-source.js";
import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";
import { parseJSONFlag } from "../../lib/parse-json-flag.js";

/** A dashboard tab. `type` is "" for a normal tab, "hidden", or a layout such as "single_widget". */
interface DashboardTab {
  key: string;
  value: string;
  type?: string;
  [field: string]: unknown;
}

/** The sidebar icon of a dashboard. */
interface DashboardIcon {
  url?: string;
  color?: string;
}

interface PayloadOptions {
  tab?: string[];
  tabs?: string;
  tabsFile?: string;
  blueprintDevices?: string;
  blueprintDevicesFile?: string;
  icon?: string;
  iconColor?: string;
  json?: boolean;
}

/** Probed: the Admin's icon picker stores `<ICON_HOST>/<name>.svg`; a missing name answers 403. */
const ICON_HOST = "https://svg.internal.tago.io";
const ICON_NAME = /^[a-z0-9-]+$/i;
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/** `--tab key=Label`: a bare `--tab main` uses the key as its label too. */
function parseTabPair(pair: string, json?: boolean): DashboardTab {
  const separator = pair.indexOf("=");
  const key = (separator === -1 ? pair : pair.slice(0, separator)).trim();
  const value = separator === -1 ? key : pair.slice(separator + 1).trim();
  if (!key || !value) {
    failWith(`Invalid tab "${pair}": expected key=Label.`, "invalid_tab", json);
  }
  return { key, value };
}

/**
 * `--tabs '<json>'`: each tab needs a key and a label; the other fields (type,
 * hidden, link, conditions) are forwarded as given for the API to validate.
 */
function parseTabList(raw: unknown[], json?: boolean): DashboardTab[] {
  return raw.map((tab, index) => {
    const record = (typeof tab === "object" && tab !== null && !Array.isArray(tab) ? tab : {}) as Record<string, unknown>;
    if (typeof record.key !== "string" || !record.key || typeof record.value !== "string" || !record.value) {
      failWith(`Invalid tab ${index + 1}: expected an object with "key" and "value".`, "invalid_tab", json);
    }
    return record as DashboardTab;
  });
}

/**
 * @description Reads the tabs from repeatable `--tab key=Label` flags, or from
 * `--tabs`/`--tabs-file` when a tab needs more than a label (a type such as
 * "single_widget", hidden, conditions). Returns `undefined` when none was
 * given, so the caller leaves the dashboard's tabs alone.
 *
 * Duplicate keys fail here: widgets are placed on a tab by its key, so two tabs
 * sharing one would leave a widget's tab ambiguous.
 */
function parseTabs(options: PayloadOptions): DashboardTab[] | undefined {
  const source = readJSONFlagSource(options.tabs, options.tabsFile, "--tabs", options);
  if (source && options.tab?.length) {
    failWith("--tab and --tabs cannot be used together.", "conflicting_flags", options.json);
  }

  const tabs = source
    ? parseTabList(parseJSONFlag<unknown[]>(source.raw, source.label, "array", options), options.json)
    : options.tab?.length
      ? options.tab.map((pair) => parseTabPair(pair, options.json))
      : undefined;
  if (!tabs) {
    return undefined;
  }

  const keys = tabs.map((tab) => tab.key);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) {
    failWith(`Tab key "${duplicate}" is used more than once.`, "invalid_tab", options.json);
  }
  return tabs;
}

/**
 * @description Reads the Blueprint slots from `--blueprint-devices` or
 * `--blueprint-devices-file`. The slots are forwarded untouched: their shape
 * (conditions, filter_conditions, entity slots) is the API's to validate, and
 * its rejection names the field.
 */
function parseBlueprintDevices(options: PayloadOptions): unknown[] | undefined {
  const source = readJSONFlagSource(options.blueprintDevices, options.blueprintDevicesFile, "--blueprint-devices", options);
  if (!source) {
    return undefined;
  }
  return parseJSONFlag<unknown[]>(source.raw, source.label, "array", options);
}

/**
 * @description Reads `--icon` (an icon name such as "wifi", or an https URL)
 * and `--icon-color` (a hex color). Returns only the parts given, or
 * `undefined` without either flag, so the caller merges them over the stored icon.
 */
function parseIcon(options: PayloadOptions): DashboardIcon | undefined {
  if (options.icon === undefined && options.iconColor === undefined) {
    return undefined;
  }
  const icon: DashboardIcon = {};
  if (options.icon !== undefined) {
    const value = options.icon.trim();
    if (value.startsWith("https://")) {
      icon.url = value;
    } else if (ICON_NAME.test(value)) {
      icon.url = `${ICON_HOST}/${value}.svg`;
    } else {
      failWith(`Invalid icon "${options.icon}": expected an icon name such as "wifi", or an https:// URL.`, "invalid_icon", options.json);
    }
  }
  if (options.iconColor !== undefined) {
    if (!HEX_COLOR.test(options.iconColor)) {
      failWith(`Invalid icon color "${options.iconColor}": expected a hex color such as "#8a3120".`, "invalid_icon_color", options.json);
    }
    icon.color = options.iconColor;
  }
  return icon;
}

export { parseBlueprintDevices, parseIcon, parseTabs };
export type { DashboardIcon, DashboardTab };
