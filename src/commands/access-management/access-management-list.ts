import { type AccessQuery, Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { buildTagFilter } from "../actions/action-list.js";
import { mapDate } from "../devices/device-list.js";

/**
 * The fields a listing may safely request.
 *
 * ⚠️ Do not add `permissions` or `targets`. Probed against a live profile:
 * asking for either makes the API answer `Sorry, Internal Error` — a 500, not an
 * omitted field. Every mocked test would stay green while the command broke
 * against every real profile, so the array is pinned by a test of its own.
 *
 * Reading a policy's permissions means calling `access-management-info`.
 */
const LIST_FIELDS = ["id", "name", "active", "created_at", "tags"] as const;

/**
 * The fields `AccessQuery` declares as orderable.
 *
 * Validated offline because the API answers an invalid one with a bare
 * `Invalid orderBy parameter`, naming neither the offending field nor the set
 * that would work.
 */
const ORDERABLE_FIELDS = ["name", "active", "created_at", "updated_at"] as const;

const ORDER_DIRECTIONS = ["asc", "desc"] as const;

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

async function accessManagementList(options: IOptions) {
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

  const query: AccessQuery = {
    amount: options.amount ?? 100,
    fields: [...LIST_FIELDS] as NonNullable<AccessQuery["fields"]>,
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

  const policies = await resources.accessManagement.list(query).catch(errorHandler);
  if (!policies) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  // No permission count column: the API cannot supply one in a listing, and a
  // zero would read as "this policy grants nothing" rather than "not fetched".
  const resultList = policies.map((policy) => ({
    ...policy,
    tags: machineMode ? policy.tags : (policy.tags?.length ?? 0),
    created_at: mapDate(policy.created_at, options),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(policies.length)} access policies found.`);
}

export { accessManagementList, LIST_FIELDS, ORDERABLE_FIELDS };
