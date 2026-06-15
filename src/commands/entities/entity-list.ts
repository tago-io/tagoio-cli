import { Resources, type EntityQuery, TagsObj } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";

// Fields we both request (`fields` below) and allow ordering by. Kept in sync
// with the selected `fields` so the SDK's typed orderBy tuple stays valid.
const ORDERABLE_FIELDS = ["name", "created_at", "updated_at"] as const;
type OrderableField = (typeof ORDERABLE_FIELDS)[number];

interface IOptions {
  environment?: string;
  tagkey: string[];
  tagvalue: string[];
  name?: string;
  orderBy?: string;
  order?: "asc" | "desc";
  json?: boolean;
  stringify?: boolean;
  silent?: boolean;
}

/** Builds a tag filter array from repeatable -k/-v pairs. */
function buildTagFilter(keys: string[], values: string[]): TagsObj[] | undefined {
  const max = Math.max(keys.length, values.length);
  if (max === 0) {
    return undefined;
  }
  const tags: TagsObj[] = [];
  for (let i = 0; i < max; i++) {
    const tag: Partial<TagsObj> = {};
    if (keys[i]) {
      tag.key = keys[i];
    }
    if (values[i]) {
      tag.value = values[i];
    }
    tags.push(tag as TagsObj);
  }
  return tags;
}

/** Reports a SDK failure either as `[ERROR] ...` or as JSON, per --json. */
function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

/** Builds the `[field, direction]` tuple the SDK expects, validating the field. */
function buildOrderBy(orderBy: string | undefined, order: string | undefined, useJSON: boolean): EntityQuery["orderBy"] | undefined {
  if (!orderBy) {
    return undefined;
  }
  if (!ORDERABLE_FIELDS.includes(orderBy as OrderableField)) {
    failWith(`Cannot order by "${orderBy}". Valid fields: ${ORDERABLE_FIELDS.join(", ")}.`, "invalid_order_field", useJSON);
  }
  const direction = order === "desc" ? "desc" : "asc";
  return [orderBy as OrderableField, direction];
}

async function entityList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const tags = buildTagFilter(options.tagkey ?? [], options.tagvalue ?? []);
  const filter: { name?: string; tags?: TagsObj[] } = {};
  if (options.name) {
    filter.name = `*${options.name}*`;
  }
  if (tags) {
    filter.tags = tags;
  }

  const orderBy = buildOrderBy(options.orderBy, options.order, Boolean(options.json));

  const list = await resources.entities
    .list({ amount: 100, fields: ["id", "name", "tags", "created_at", "updated_at"], filter, ...(orderBy ? { orderBy } : {}) })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to list entities: ${message}`, "list_failed", Boolean(options.json));
    });

  if (!list) {
    return;
  }

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(list)}\n`);
    return;
  }

  console.table(list.map((x) => ({ id: x.id, name: x.name, tags: x.tags?.length ?? 0, updated_at: x.updated_at })));
  successMSG(`${list.length} entities found.`);
}

export { entityList };
