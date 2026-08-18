import { Resources, type SQLCreateInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickSQLIDFromTagoIO } from "../../prompt/pick-sql-id-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { parseSQLParams, resolveQuery } from "./sql-payload.js";

interface IOptions {
  environment?: string;
  name?: string;
  query?: string;
  queryFile?: string;
  description?: string;
  param?: string[];
  cache?: boolean;
  noCache?: boolean;
  cacheTtl?: number;
  rateLimit?: number;
  activate?: boolean;
  deactivate?: boolean;
  tagkey?: string[];
  tagvalue?: string[];
  mergeTags?: boolean;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/** True when the caller asked for at least one change. */
function hasPatch(options: IOptions): boolean {
  return (
    options.name !== undefined ||
    options.query !== undefined ||
    options.queryFile !== undefined ||
    options.description !== undefined ||
    Boolean(options.param?.length) ||
    options.cache !== undefined ||
    options.noCache !== undefined ||
    options.cacheTtl !== undefined ||
    options.rateLimit !== undefined ||
    Boolean(options.activate) ||
    Boolean(options.deactivate) ||
    Boolean(options.tagkey?.length)
  );
}

async function sqlEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.activate && options.deactivate) {
    failWith("--activate and --deactivate cannot be used together.", "conflicting_flags", options.json);
  }

  if (options.cache && options.noCache) {
    failWith("--cache and --no-cache cannot be used together.", "conflicting_flags", options.json);
  }

  // Parsed before the read so a malformed payload costs neither call.
  const query = resolveQuery(options);
  const params = parseSQLParams(options.param ?? [], options);

  if (!hasPatch(options)) {
    // Checked before the read: a no-op must not pay for the lookup the PUT merge
    // would otherwise need.
    failWith("Nothing to update — pass a field to change, --query, --param, or tags.", "no_changes", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickSQLIDFromTagoIO(resources);
  }

  // The API is a full PUT, not a PATCH. Probed: `edit(id, { name })` fails with
  // `Invalid JSON: missing field query`, and the SDK types the body as
  // `SQLCreateInfo` rather than `Partial<…>` because it means it.
  //
  // So the current record is read and the patch merged over it. A failed read
  // aborts rather than sending a partial body, which would blank the query.
  //
  // The consequence is a real race, stated in --help: because the whole record is
  // rewritten, a concurrent edit from the admin is overwritten. Changing the SQL
  // takes a fresh version, so the previous text stays recoverable via
  // `sql-version` — probed, a metadata-only edit does not.
  const current = await resources.sql.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`SQL query with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!current) {
    return;
  }

  const payload: SQLCreateInfo = {
    name: options.name ?? current.name,
    query: query ?? current.query,
    ...(options.description !== undefined
      ? { description: options.description }
      : current.description !== undefined && current.description !== null
        ? { description: current.description }
        : {}),
    params: params ?? current.params,
    cache_enabled: options.cache ? true : options.noCache ? false : current.cache_enabled,
    cache_ttl_seconds: options.cacheTtl ?? current.cache_ttl_seconds,
    rate_limit_rpm: options.rateLimit ?? current.rate_limit_rpm,
    active: options.activate ? true : options.deactivate ? false : current.active,
  };

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    // The record was already read for the PUT, so merging costs no extra call.
    payload.tags = options.mergeTags ? mergeTags(current.tags ?? [], incoming) : incoming;
  } else if (current.tags) {
    payload.tags = current.tags;
  }

  const updated = await resources.sql.edit(id, payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit SQL query ${id}: ${message}`, "edit_failed", options.json);
  });

  if (!updated) {
    return;
  }

  if (options.json) {
    // The version comes from the response. It advances only when the SQL text
    // changed — probed, a rename leaves it alone — so reporting it is how a
    // caller knows whether this edit created a revision.
    process.stdout.write(`${JSON.stringify({ id, updated: true, version: updated.version })}\n`);
    return;
  }

  successMSG(`SQL query ${id} updated (now version ${updated.version}).`);
}

export { hasPatch, sqlEdit };
