import { type AnalysisQuery, Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { buildTagFilter, mapLastTriggered } from "../actions/action-list.js";

/**
 * The fields `AnalysisQuery` declares as orderable.
 *
 * Validated offline because the API answers an invalid one with a bare
 * `Invalid orderBy parameter`, naming neither the offending field nor the set
 * that would work.
 */
const ORDERABLE_FIELDS = ["name", "active", "run_on", "last_run", "created_at", "updated_at"] as const;

const ORDER_DIRECTIONS = ["asc", "desc"] as const;

/** Probed: the API rejects anything else with an enum error naming both values. */
const RUN_ON_VALUES = ["tago", "external"] as const;

interface IOptions {
  environment?: string;
  name?: string;
  active?: boolean;
  inactive?: boolean;
  runOn?: string;
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

/** Shared by list and edit, so an invalid value fails the same way in both. */
function assertRunOn(runOn: string | undefined, options: { json?: boolean }) {
  if (runOn && !RUN_ON_VALUES.includes(runOn as (typeof RUN_ON_VALUES)[number])) {
    failWith(`Invalid --run-on "${runOn}". Use one of: ${RUN_ON_VALUES.join(", ")}.`, "invalid_run_on", options.json);
  }
}

async function analysisList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.active && options.inactive) {
    failWith("--active and --inactive cannot be used together.", "conflicting_flags", options.json);
  }

  assertRunOn(options.runOn, options);

  if (options.orderBy && !ORDERABLE_FIELDS.includes(options.orderBy as (typeof ORDERABLE_FIELDS)[number])) {
    failWith(`Cannot order by "${options.orderBy}". Order by one of: ${ORDERABLE_FIELDS.join(", ")}.`, "invalid_order_by", options.json);
  }

  if (options.order && !ORDER_DIRECTIONS.includes(options.order as (typeof ORDER_DIRECTIONS)[number])) {
    failWith(`Invalid --order "${options.order}". Use asc or desc.`, "invalid_order", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // The SDK defaults to 20, so the wider default is passed explicitly. `token`
  // is deliberately absent from the field list: it authenticates as the
  // analysis, and a listing is the last place to put a credential.
  const query: AnalysisQuery = {
    amount: options.amount ?? 100,
    fields: ["id", "name", "active", "run_on", "runtime", "last_run", "created_at", "tags"],
    filter: {},
  };

  if (query.filter && options.name) {
    query.filter.name = `*${options.name}*`;
  }

  if (query.filter && (options.active || options.inactive)) {
    // `AnalysisCreateInfo.active` is declared `active?: true`, which narrows the
    // filter type to the literal `true` and makes `--inactive` inexpressible.
    // Probed: the API accepts `false` on both filter and patch. The cast is the
    // narrowest way to say what the endpoint actually supports.
    query.filter.active = Boolean(options.active) as true;
  }

  const tags = buildTagFilter(options.tagkey ?? [], options.tagvalue ?? []);
  if (query.filter && tags) {
    query.filter.tags = tags as NonNullable<typeof query.filter.tags>;
  }

  if (options.orderBy) {
    query.orderBy = [options.orderBy as (typeof ORDERABLE_FIELDS)[number], (options.order ?? "asc") as "asc" | "desc"];
  }

  const fetched = await resources.analysis.list(query).catch(errorHandler);
  if (!fetched) {
    return;
  }

  // `run_on` is filtered here rather than in the query. `AnalysisQuery` declares
  // it filterable, but the API ignores it: isolated against a live profile,
  // `filter: { run_on: "external" }` returned all 15 analyses including every
  // `tago` one, and a nonsense value came back unfiltered rather than rejected —
  // while `name` and `tags` on the same endpoint narrow correctly.
  //
  // Forwarding it would look right and silently return everything, so the
  // narrowing happens where it can actually be guaranteed.
  const analyses = options.runOn ? fetched.filter((analysis) => analysis.run_on === options.runOn) : fetched;

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = analyses.map((analysis) => {
    // `token` is stripped rather than merely unrequested: the API adds fields to
    // a listing beyond what `fields` asks for — probed, it always appends `tags`
    // and `last_run` — so relying on the query alone to keep it out is fragile.
    const { token: _token, ...rest } = analysis as typeof analysis & { token?: string };
    return {
      ...rest,
      tags: machineMode ? analysis.tags : (analysis.tags?.length ?? 0),
      // Probed: `last_run` is the literal string "never" for an analysis that
      // never ran — the same sentinel Actions uses for `last_triggered`, and the
      // shape `mapDate` would throw on.
      last_run: mapLastTriggered(analysis.last_run, options),
    };
  });

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(analyses.length)} analyses found.`);
}

export { analysisList, assertRunOn, ORDERABLE_FIELDS, RUN_ON_VALUES };
