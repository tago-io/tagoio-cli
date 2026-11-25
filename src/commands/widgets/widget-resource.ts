import { randomBytes } from "node:crypto";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

/** The three filter sections of a custom widget, as the Admin names them. */
const FILTER_KINDS = ["device", "user", "entity"] as const;
type FilterKind = (typeof FILTER_KINDS)[number];

const COLUMN_TYPES = ["parameter", "tag", "configuration_parameter", "field"] as const;
type ColumnType = (typeof COLUMN_TYPES)[number];

interface ResourceGroupFilter {
  from_blueprint: boolean;
  tag_key: string;
  tag_value: string;
  blueprint_device: string;
  blueprint_device_tag_match: string;
}

interface ResourceGroupColumn {
  type: ColumnType;
  parameter?: string;
  tag?: string;
  configuration_parameter?: string;
  field?: string;
  editable: boolean;
}

/** One data source group, as the Admin stores it in `display.resource_options`. */
interface ResourceGroup {
  id: string;
  amount?: number | null;
  filters: ResourceGroupFilter[];
  data: ResourceGroupColumn[];
}

type ResourceOptions = Partial<Record<FilterKind, { groups: ResourceGroup[] }>>;

/** One entry of the widget's `resource` array: what the widget receives at runtime. */
interface ResourceEntry {
  type: string;
  [key: string]: unknown;
}

/**
 * How each Admin section maps onto `resource`. Probed on a custom widget whose
 * filters were set in the Admin: a device group became `type: "device"`, a user
 * group `type: "user"`, and an entity group `type: "entity_list"`, each with
 * the `orderBy` below and `amount: 1000` when the group set none.
 */
const RESOURCE_TYPE: Record<FilterKind, string> = { device: "device", user: "user", entity: "entity_list" };
const ORDER_BY: Record<FilterKind, string> = { device: "created_at,asc", user: "created_at,asc", entity: "desc" };
const DEFAULT_AMOUNT = 1000;

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * A 21-character ID, the shape the Admin gives each group it creates. Its
 * alphabet is base64url's, and 21 characters take 126 of the 128 random bits.
 */
function newGroupID(): string {
  return randomBytes(16).toString("base64url").slice(0, 21);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * @description Fills a filter in the Admin's stored shape, which keeps every key
 * and uses "" for the ones that do not apply. `from_blueprint` may be left out:
 * a filter naming a `blueprint_device` follows that slot.
 */
function normalizeFilter(raw: unknown, at: string, json?: boolean): ResourceGroupFilter {
  if (!isRecord(raw)) {
    failWith(`Invalid filter ${at}: expected an object.`, "invalid_filter", json);
  }
  const fromBlueprint = raw.from_blueprint === undefined ? Boolean(raw.blueprint_device) : raw.from_blueprint === true;
  const filter = {
    from_blueprint: fromBlueprint,
    tag_key: fromBlueprint ? "" : text(raw.tag_key),
    tag_value: fromBlueprint ? "" : text(raw.tag_value),
    blueprint_device: fromBlueprint ? text(raw.blueprint_device) : "",
    blueprint_device_tag_match: fromBlueprint ? text(raw.blueprint_device_tag_match) : "",
  };
  if (fromBlueprint && (!filter.blueprint_device || !filter.blueprint_device_tag_match)) {
    failWith(`Invalid filter ${at}: a Blueprint filter needs blueprint_device (the slot ID) and blueprint_device_tag_match.`, "invalid_filter", json);
  }
  if (!fromBlueprint && !filter.tag_key) {
    failWith(`Invalid filter ${at}: expected tag_key and tag_value, or a Blueprint filter.`, "invalid_filter", json);
  }
  return filter;
}

function normalizeColumn(raw: unknown, at: string, json?: boolean): ResourceGroupColumn {
  if (!isRecord(raw) || !COLUMN_TYPES.includes(raw.type as ColumnType)) {
    failWith(`Invalid column ${at}: "type" must be one of ${COLUMN_TYPES.join(", ")}.`, "invalid_filter", json);
  }
  const type = raw.type as ColumnType;
  const name = text(raw[type]);
  if (!name) {
    failWith(`Invalid column ${at}: a "${type}" column needs a "${type}" name.`, "invalid_filter", json);
  }
  return { type, [type]: name, editable: raw.editable === true };
}

/**
 * @description Validates the groups passed to a filter flag and brings them to
 * the Admin's stored shape. A group copied from `widget-info --json` keeps its
 * `id`; a new one gets a fresh ID.
 */
function normalizeGroups(raw: unknown[], kind: FilterKind, json?: boolean): ResourceGroup[] {
  return raw.map((group, index) => {
    const at = `in ${kind} group ${index + 1}`;
    if (!isRecord(group) || !Array.isArray(group.filters) || !Array.isArray(group.data)) {
      failWith(`Invalid ${kind} group ${index + 1}: expected an object with "filters" and "data" arrays.`, "invalid_filter", json);
    }
    return {
      id: text(group.id) || newGroupID(),
      ...(typeof group.amount === "number" ? { amount: group.amount } : {}),
      filters: group.filters.map((filter, position) => normalizeFilter(filter, `${position + 1} ${at}`, json)),
      data: group.data.map((column, position) => normalizeColumn(column, `${position + 1} ${at}`, json)),
    };
  });
}

/** The name a column takes in `view`/`editable`: `name`, `tags.eui`, `param.address`, `id`. */
function columnName(column: ResourceGroupColumn): string {
  if (column.type === "tag") {
    return `tags.${column.tag}`;
  }
  if (column.type === "configuration_parameter") {
    return `param.${column.configuration_parameter}`;
  }
  return String(column[column.type]);
}

/**
 * @description Derives the `resource` entry the Admin builds from a group.
 * Probed: a Blueprint filter becomes `{ key: <tag to match>, value: <slot ID> }`,
 * which the platform resolves against the device picked in that slot.
 */
function groupToResource(kind: FilterKind, group: ResourceGroup): ResourceEntry {
  return {
    type: RESOURCE_TYPE[kind],
    view: group.data.map(columnName),
    amount: group.amount ?? DEFAULT_AMOUNT,
    filter: group.filters.map((filter) =>
      filter.from_blueprint ? { key: filter.blueprint_device_tag_match, value: filter.blueprint_device } : { key: filter.tag_key, value: filter.tag_value },
    ),
    orderBy: ORDER_BY[kind],
    editable: group.data.filter((column) => column.editable).map(columnName),
  };
}

interface FilterTarget {
  resourceOptions: ResourceOptions | undefined;
  resource: ResourceEntry[] | undefined;
}

/**
 * @description Replaces the groups of the given filter sections and rebuilds
 * the matching `resource` entries.
 *
 * Both halves are written because the Admin keeps the groups as the editor's
 * state and rebuilds `resource` from them on save: writing only `resource`
 * would be undone the next time someone saves the widget in the Admin.
 *
 * Sections not passed keep both their groups and their entries untouched, and
 * so do entries no section produces (such as an entity bound to a Blueprint
 * slot, which the Admin does not derive from a group).
 */
function applyFilterGroups(
  current: FilterTarget,
  changes: Partial<Record<FilterKind, ResourceGroup[]>>,
): { resourceOptions: ResourceOptions; resource: ResourceEntry[] } {
  const changedKinds = FILTER_KINDS.filter((kind) => changes[kind] !== undefined);
  const resourceOptions: ResourceOptions = { ...current.resourceOptions };
  for (const kind of changedKinds) {
    resourceOptions[kind] = { groups: changes[kind] as ResourceGroup[] };
  }

  const replacedTypes = new Set(changedKinds.map((kind) => RESOURCE_TYPE[kind]));
  const kept = (current.resource ?? []).filter((entry) => !replacedTypes.has(entry.type));
  const derived = changedKinds.flatMap((kind) => (changes[kind] as ResourceGroup[]).map((group) => groupToResource(kind, group)));

  return { resourceOptions, resource: [...kept, ...derived] };
}

/** One readable line per group, for the human view of `widget-info`. */
function describeGroups(resourceOptions: ResourceOptions | undefined): string[] {
  return FILTER_KINDS.flatMap((kind) =>
    (resourceOptions?.[kind]?.groups ?? []).map((group) => {
      const filters = group.filters
        .map((filter) =>
          filter.from_blueprint ? `${filter.blueprint_device_tag_match}=<slot ${filter.blueprint_device}>` : `${filter.tag_key}=${filter.tag_value}`,
        )
        .join(", ");
      const columns = group.data.map((column) => `${columnName(column)}${column.editable ? " (editable)" : ""}`).join(", ");
      return `${kind}: ${filters || "(no filter)"}; columns ${columns || "(none)"}`;
    }),
  );
}

/**
 * The entity index an entity data source reads through when none is given.
 * Probed: every entity gets it by default, and it is the index the Admin wrote
 * on a custom widget whose entity data source was set there.
 */
const DEFAULT_ENTITY_INDEX = "id_updated_at_idx";

/** The keys an entity data source accepts, after the schema's entity resource. */
const ENTITY_SOURCE_KEYS = new Set(["type", "id", "index", "view", "editable", "amount", "orderBy", "filter"]);

/** The schema caps an entity resource at this many rows. */
const MAX_ENTITY_AMOUNT = 10000;

/**
 * @description Refuses what the platform would store but never use: an unknown
 * key (a typo such as `order_by` would silently keep the default), a `type`
 * other than "entity" (`entity_list` belongs to `--entity-filter`), an editable
 * field the widget does not show, or an amount outside 1 to 10000.
 */
function checkEntitySource(source: Record<string, unknown>, at: string, json?: boolean): void {
  const unknown = Object.keys(source).filter((key) => !ENTITY_SOURCE_KEYS.has(key));
  if (unknown.length) {
    failWith(
      `Invalid ${at}: unknown key ${unknown.map((key) => `"${key}"`).join(", ")}. Use ${[...ENTITY_SOURCE_KEYS].join(", ")}.`,
      "invalid_entity_source",
      json,
    );
  }
  if (source.type !== undefined && source.type !== "entity") {
    failWith(`Invalid ${at}: "type" must be "entity" or left out. Use --entity-filter for entity lists.`, "invalid_entity_source", json);
  }
  const view = source.view;
  if (!Array.isArray(view) || !view.length || view.some((field) => typeof field !== "string" || !field)) {
    failWith(`Invalid ${at}: "view" must list the fields to show, such as ["name", "status"].`, "invalid_entity_source", json);
  }
  const editable = source.editable ?? [];
  if (!Array.isArray(editable) || editable.some((field) => typeof field !== "string" || !view.includes(field))) {
    failWith(`Invalid ${at}: "editable" must list fields that are also in "view".`, "invalid_entity_source", json);
  }
  if (source.amount !== undefined && !(Number.isInteger(source.amount) && (source.amount as number) > 0 && (source.amount as number) <= MAX_ENTITY_AMOUNT)) {
    failWith(`Invalid ${at}: "amount" must be a whole number from 1 to ${MAX_ENTITY_AMOUNT}.`, "invalid_entity_source", json);
  }
  if (source.orderBy !== undefined && source.orderBy !== "asc" && source.orderBy !== "desc") {
    failWith(`Invalid ${at}: "orderBy" must be "asc" or "desc".`, "invalid_entity_source", json);
  }
}

/**
 * @description Validates the entity data sources passed to `--entity-source`
 * and fills the defaults the Admin writes. Each source reads the rows of one
 * entity: `id` is an entity ID, or a Blueprint entity slot ID so the rows
 * follow the entity picked in that slot. `view` names the fields to show.
 *
 * These live in `resource` only, as `type: "entity"`; unlike the filter
 * sections, the Admin keeps no editor state for them in `resource_options`.
 * Probed: such an entry survived a save of the widget in the Admin.
 */
function normalizeEntitySources(raw: unknown[], json?: boolean): ResourceEntry[] {
  return raw.map((source, index) => {
    const at = `entity source ${index + 1}`;
    if (!isRecord(source) || !text(source.id)) {
      failWith(`Invalid ${at}: expected an object with "id" (an entity or a Blueprint entity slot ID).`, "invalid_entity_source", json);
    }
    checkEntitySource(source, at, json);
    return {
      ...source,
      type: "entity",
      id: text(source.id),
      index: text(source.index) || DEFAULT_ENTITY_INDEX,
      view: source.view,
      editable: source.editable ?? [],
      amount: source.amount ?? DEFAULT_AMOUNT,
      orderBy: source.orderBy ?? "desc",
    };
  });
}

/** Replaces the `type: "entity"` entries of `resource`, keeping every other entry. */
function applyEntitySources(resource: ResourceEntry[] | undefined, sources: ResourceEntry[]): ResourceEntry[] {
  return [...(resource ?? []).filter((entry) => entry.type !== "entity"), ...sources];
}

export { applyEntitySources, applyFilterGroups, columnName, describeGroups, FILTER_KINDS, groupToResource, normalizeEntitySources, normalizeGroups };
export type { FilterKind, ResourceEntry, ResourceGroup, ResourceOptions };
