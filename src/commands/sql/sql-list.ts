import { Resources, type SQLQuery } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { buildTagFilter } from "../actions/action-list.js";
import { mapDate } from "../devices/device-list.js";

/**
 * The fields `SQLQuery` declares as orderable.
 *
 * ⚠️ Validated offline because the API does **not** validate it. Probed:
 * `orderBy: ["query","asc"]` returned rows rather than an error — unlike every
 * other family in this CLI, where the API rejects and the local check merely
 * improves the message. Here it is the only check there is, so a typo would
 * otherwise produce a silently mis-ordered list.
 */
const ORDERABLE_FIELDS = ["name", "active", "created_at", "updated_at"] as const;

const ORDER_DIRECTIONS = ["asc", "desc"] as const;

/**
 * Probed: a listing returns `id`, `name` and `tags` no matter what `fields`
 * asks for — six requested came back as three. Passed for intent, so the day
 * the API honours it the request is already correct.
 */
const LIST_FIELDS = ["id", "name", "active", "created_at", "updated_at", "tags"] as const;

interface IOptions {
  environment?: string;
  name?: string;
  active?: boolean;
  inactive?: boolean;
  tagkey?: string[];
  tagvalue?: string[];
  amount?: number;
  orderBy?: string;
  order?: string;
  stringify?: boolean;
  json?: boolean;
  raw?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function sqlList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.active && options.inactive) {
    failWith("--active and --inactive cannot be used together.", "conflicting_flags", options.json);
  }

  if (options.orderBy && !ORDERABLE_FIELDS.includes(options.orderBy as (typeof ORDERABLE_FIELDS)[number])) {
    failWith(`Cannot order by "${options.orderBy}". Order by one of: ${ORDERABLE_FIELDS.join(", ")}.`, "invalid_order_by", options.json);
  }

  if (options.order && !ORDER_DIRECTIONS.includes(options.order as (typeof ORDER_DIRECTIONS)[number])) {
    failWith(`Invalid --order "${options.order}". Use asc or desc.`, "invalid_order", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const query: SQLQuery = {
    amount: options.amount ?? 100,
    fields: [...LIST_FIELDS] as NonNullable<SQLQuery["fields"]>,
    filter: {},
  };

  if (query.filter && options.name) {
    query.filter.name = `*${options.name}*`;
  }

  if (query.filter && (options.active || options.inactive)) {
    query.filter.active = Boolean(options.active);
  }

  const tags = buildTagFilter(options.tagkey ?? [], options.tagvalue ?? []);
  if (query.filter && tags) {
    query.filter.tags = tags as NonNullable<typeof query.filter.tags>;
  }

  if (options.orderBy) {
    query.orderBy = [options.orderBy as (typeof ORDERABLE_FIELDS)[number], (options.order ?? "asc") as "asc" | "desc"];
  }

  const queries = await resources.sql.list(query).catch(errorHandler);
  if (!queries) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = queries.map((item) => ({
    ...item,
    tags: machineMode ? item.tags : (item.tags?.length ?? 0),
    // `created_at` is absent from a listing today, so this is a no-op there and
    // correct if the API starts returning it.
    ...(item.created_at ? { created_at: mapDate(item.created_at, options) } : {}),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(queries.length)} SQL queries found.`);
}

export { LIST_FIELDS, ORDERABLE_FIELDS, sqlList };
