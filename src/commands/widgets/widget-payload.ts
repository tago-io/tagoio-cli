import { readJSONFlagSource } from "../../lib/json-flag-source.js";
import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";
import { parseJSONFlag } from "../../lib/parse-json-flag.js";
import { FILTER_KINDS, type FilterKind, normalizeEntitySources, normalizeGroups, type ResourceEntry, type ResourceGroup } from "./widget-resource.js";

/** A custom widget parameter, which the widget code reads by key. */
interface WidgetParameter {
  key: string;
  value: string;
}

interface WidgetFlagOptions {
  param?: string[];
  data?: string;
  dataFile?: string;
  clearData?: boolean;
  deviceFilter?: string;
  deviceFilterFile?: string;
  clearDeviceFilter?: boolean;
  userFilter?: string;
  userFilterFile?: string;
  clearUserFilter?: boolean;
  entityFilter?: string;
  entityFilterFile?: string;
  clearEntityFilter?: boolean;
  entitySource?: string;
  entitySourceFile?: string;
  clearEntitySource?: boolean;
  maxData?: number;
  frameSettings?: string;
  frameSettingsFile?: string;
  json?: boolean;
}

/** The frame the schema defaults to, which the Admin writes on its first save. */
const DEFAULT_FRAME_SETTINGS = {
  radius: { top_left: 3, top_right: 3, bottom_left: 3, bottom_right: 3 },
  padding: { top: 5, right: 5, bottom: 5, left: 5 },
  shadow: { hide: false },
  header_visibility: "show_always",
};

/** The frame's object keys and the sides or fields each accepts; `header_visibility` takes one of HEADER_VISIBILITY. */
const FRAME_OBJECT_KEYS: Record<string, string[]> = {
  radius: ["top_left", "top_right", "bottom_left", "bottom_right"],
  padding: ["top", "right", "bottom", "left"],
  shadow: ["hide"],
};
const HEADER_VISIBILITY = ["show_always", "show_on_hover", "show_only_buttons"];

const FILTER_FLAGS: Record<FilterKind, { inline: keyof WidgetFlagOptions; file: keyof WidgetFlagOptions; clear: keyof WidgetFlagOptions }> = {
  device: { inline: "deviceFilter", file: "deviceFilterFile", clear: "clearDeviceFilter" },
  user: { inline: "userFilter", file: "userFilterFile", clear: "clearUserFilter" },
  entity: { inline: "entityFilter", file: "entityFilterFile", clear: "clearEntityFilter" },
};

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Parses repeatable `--param KEY=VALUE` flags. Splits on the first
 * `=` only, so a value carrying its own `=` (a URL with a query string) survives.
 * Returns `undefined` when none was given, so the stored parameters stay.
 */
function parseParams(pairs: string[], options: { json?: boolean }): WidgetParameter[] | undefined {
  if (!pairs.length) {
    return undefined;
  }
  return pairs.map((pair) => {
    const separator = pair.indexOf("=");
    const key = separator === -1 ? "" : pair.slice(0, separator).trim();
    if (!key) {
      failWith(`Invalid parameter "${pair}": expected KEY=VALUE.`, "invalid_param", options.json);
    }
    return { key, value: pair.slice(separator + 1) };
  });
}

/**
 * @description Reads the widget's data sources (`data[]`) from `--data` or
 * `--data-file`, or `[]` for `--clear-data`. Forwarded untouched: the API
 * validates origins, variables and queries and names the field it rejects.
 */
function parseData(options: WidgetFlagOptions): unknown[] | undefined {
  const source = readJSONFlagSource(options.data, options.dataFile, "--data", options);
  if (source && options.clearData) {
    failWith("--data and --clear-data cannot be used together.", "conflicting_flags", options.json);
  }
  if (options.clearData) {
    return [];
  }
  return source ? parseJSONFlag<unknown[]>(source.raw, source.label, "array", options) : undefined;
}

/**
 * @description Reads `--max-data`, the most records per device the widget's
 * data sources return (`display.max_data`; the Admin writes 1000). Returns
 * `undefined` when absent, so the stored value stays.
 */
function parseMaxData(options: WidgetFlagOptions): number | undefined {
  if (options.maxData === undefined) {
    return undefined;
  }
  if (!Number.isInteger(options.maxData) || options.maxData < 1) {
    failWith("--max-data must be a whole number greater than 0.", "invalid_max_data", options.json);
  }
  return options.maxData;
}

/**
 * @description Reads `--frame-settings` or `--frame-settings-file`: the parts
 * of `display.frame_settings` to change (radius, padding, shadow,
 * header_visibility). Returns `undefined` without either flag.
 */
function parseFrameSettings(options: WidgetFlagOptions): Record<string, unknown> | undefined {
  const source = readJSONFlagSource(options.frameSettings, options.frameSettingsFile, "--frame-settings", options);
  if (!source) {
    return undefined;
  }
  const frame = parseJSONFlag<Record<string, unknown>>(source.raw, source.label, "object", options);
  checkFrameSettings(frame, options.json);
  return frame;
}

/**
 * @description Refuses a frame key, side or header value the platform would
 * store but never apply, such as a typo in `header_visibility`.
 */
function checkFrameSettings(frame: Record<string, unknown>, json?: boolean): void {
  const fail = (detail: string): never => failWith(`Invalid --frame-settings: ${detail}`, "invalid_frame_settings", json);
  for (const [key, value] of Object.entries(frame)) {
    if (key === "header_visibility") {
      if (!HEADER_VISIBILITY.includes(value as string)) {
        fail(`"header_visibility" must be one of ${HEADER_VISIBILITY.join(", ")}.`);
      }
      continue;
    }
    // hasOwn, so "toString" or "constructor" is an unknown key rather than an inherited lookup.
    if (!Object.hasOwn(FRAME_OBJECT_KEYS, key)) {
      fail(`unknown key "${key}". Use ${[...Object.keys(FRAME_OBJECT_KEYS), "header_visibility"].join(", ")}.`);
    }
    const problem = checkFrameObject(key, value);
    if (problem) {
      fail(problem);
    }
  }
}

/** Names what is wrong with a radius, padding or shadow value, or returns undefined when it is valid. */
function checkFrameObject(key: string, value: unknown): string | undefined {
  const fields = FRAME_OBJECT_KEYS[key];
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((field) => !fields.includes(field))) {
    return `"${key}" must be an object with ${fields.join(", ")}.`;
  }
  const isShadow = key === "shadow";
  const valid = (field: unknown) => (isShadow ? typeof field === "boolean" : typeof field === "number" && Number.isFinite(field) && field >= 0);
  if (Object.values(value).some((field) => !valid(field))) {
    return `"${key}" values must be ${isShadow ? "true or false" : "numbers of 0 or more"}.`;
  }
  return undefined;
}

/**
 * @description Lays the given frame over the stored frame, or over the schema
 * defaults when the widget has none. Radius, padding and shadow merge field by
 * field, so `{ "radius": { "top_left": 16 } }` keeps the other corners.
 */
function applyFrameSettings(stored: unknown, given: Record<string, unknown>): Record<string, unknown> {
  const base = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...DEFAULT_FRAME_SETTINGS, ...base, ...given };
  for (const key of Object.keys(FRAME_OBJECT_KEYS)) {
    if (given[key]) {
      const fallback = DEFAULT_FRAME_SETTINGS[key as keyof typeof DEFAULT_FRAME_SETTINGS] as object;
      merged[key] = { ...fallback, ...(base[key] as object | undefined), ...(given[key] as object) };
    }
  }
  return merged;
}

/**
 * @description Reads the device, user and entity filter flags. Each one present
 * replaces that section's groups; `--clear-<kind>-filter` empties it. Sections
 * without a flag are absent from the result and stay as stored.
 */
function parseFilters(options: WidgetFlagOptions): Partial<Record<FilterKind, ResourceGroup[]>> | undefined {
  const changes: Partial<Record<FilterKind, ResourceGroup[]>> = {};
  for (const kind of FILTER_KINDS) {
    const flags = FILTER_FLAGS[kind];
    const source = readJSONFlagSource(options[flags.inline] as string | undefined, options[flags.file] as string | undefined, `--${kind}-filter`, options);
    if (source && options[flags.clear]) {
      failWith(`--${kind}-filter and --clear-${kind}-filter cannot be used together.`, "conflicting_flags", options.json);
    }
    if (options[flags.clear]) {
      changes[kind] = [];
    } else if (source) {
      changes[kind] = normalizeGroups(parseJSONFlag<unknown[]>(source.raw, source.label, "array", options), kind, options.json);
    }
  }
  return Object.keys(changes).length ? changes : undefined;
}

/**
 * @description Reads the entity data sources from `--entity-source` or
 * `--entity-source-file`, or `[]` for `--clear-entity-source`. Returns
 * `undefined` without either, so the stored sources stay.
 */
function parseEntitySources(options: WidgetFlagOptions): ResourceEntry[] | undefined {
  const source = readJSONFlagSource(options.entitySource, options.entitySourceFile, "--entity-source", options);
  if (source && options.clearEntitySource) {
    failWith("--entity-source and --clear-entity-source cannot be used together.", "conflicting_flags", options.json);
  }
  if (options.clearEntitySource) {
    return [];
  }
  return source ? normalizeEntitySources(parseJSONFlag<unknown[]>(source.raw, source.label, "array", options), options.json) : undefined;
}

export { applyFrameSettings, parseData, parseEntitySources, parseFilters, parseFrameSettings, parseMaxData, parseParams };
export type { WidgetFlagOptions, WidgetParameter };
