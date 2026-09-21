import { Resources, type UserQuery } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { buildTagFilter, mapLastTriggered } from "../actions/action-list.js";

/**
 * The only fields the API will order by.
 *
 * Probed against a live profile: `orderBy: ["email","asc"]` fails with
 * `Invalid orderBy parameter`, naming neither the offending field nor the valid
 * set. Note the asymmetry — `email` is filterable but not orderable, which
 * nothing in `UserQuery` reveals.
 */
const ORDERABLE_FIELDS = ["name", "active", "last_login", "created_at", "updated_at"] as const;

const ORDER_DIRECTIONS = ["asc", "desc"] as const;

interface IOptions {
  environment?: string;
  name?: string;
  email?: string;
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

async function runUserList(options: IOptions) {
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

  // The SDK defaults to 20, so the wider default is passed explicitly.
  const query: UserQuery = {
    amount: options.amount ?? 100,
    fields: ["id", "name", "email", "active", "last_login", "created_at", "tags"],
    filter: {},
  };

  if (query.filter && options.name) {
    query.filter.name = `*${options.name}*`;
  }

  if (query.filter && options.email) {
    query.filter.email = `*${options.email}*`;
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

  const users = await resources.run.listUsers(query).catch(errorHandler);
  if (!users) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = users.map((user) => ({
    ...user,
    tags: machineMode ? user.tags : (user.tags?.length ?? 0),
    // `last_login` is null for a user who has never signed in. `mapLastTriggered`
    // already normalizes that to "never" so machine readers always find the key.
    last_login: mapLastTriggered(user.last_login, options),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(users.length)} run users found.`);
}

export { ORDERABLE_FIELDS, runUserList };
