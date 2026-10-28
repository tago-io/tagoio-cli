import { Resources, type DashboardQuery } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { buildTagFilter } from "../actions/action-list.js";
import { mapDate } from "../devices/device-list.js";

/** The fields `DashboardQuery` accepts in `orderBy`. */
const ORDERABLE_FIELDS = ["label", "created_at", "updated_at"] as const;

const ORDER_DIRECTIONS = ["asc", "desc"] as const;

const LIST_FIELDS = ["id", "label", "type", "visible", "tags", "created_at", "updated_at"] as const;

interface IOptions {
  environment?: string;
  name?: string;
  tagkey?: string[];
  tagvalue?: string[];
  amount?: number;
  page?: number;
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

async function dashboardList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.orderBy && !ORDERABLE_FIELDS.includes(options.orderBy as (typeof ORDERABLE_FIELDS)[number])) {
    failWith(`Cannot order by "${options.orderBy}". Order by one of: ${ORDERABLE_FIELDS.join(", ")}.`, "invalid_order_by", options.json);
  }

  if (options.order && !ORDER_DIRECTIONS.includes(options.order as (typeof ORDER_DIRECTIONS)[number])) {
    failWith(`Invalid --order "${options.order}". Use asc or desc.`, "invalid_order", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // Probed: the API ignores a `type` filter and returns every dashboard, so
  // there is no --type flag; the type is shown as a column instead.
  const filter: Record<string, unknown> = {};
  if (options.name) {
    filter.label = `*${options.name}*`;
  }
  const tags = buildTagFilter(options.tagkey ?? [], options.tagvalue ?? []);
  if (tags) {
    filter.tags = tags;
  }

  const query: DashboardQuery = {
    amount: options.amount ?? 100,
    page: options.page ?? 1,
    fields: [...LIST_FIELDS] as NonNullable<DashboardQuery["fields"]>,
    filter: filter as DashboardQuery["filter"],
  };

  if (options.orderBy) {
    query.orderBy = [options.orderBy as (typeof ORDERABLE_FIELDS)[number], (options.order ?? "asc") as "asc" | "desc"];
  }

  const dashboards = await resources.dashboards.list(query).catch(errorHandler);
  if (!dashboards) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = dashboards.map((item) => ({
    id: item.id,
    label: item.label,
    type: item.type,
    visible: item.visible,
    tags: machineMode ? item.tags : (item.tags?.length ?? 0),
    created_at: mapDate(item.created_at, options),
    updated_at: mapDate(item.updated_at, options),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(dashboards.length)} dashboards found.`);
}

export { dashboardList, ORDERABLE_FIELDS };
