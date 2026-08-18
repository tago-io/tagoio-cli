import { Resources, type SQLInfo as SQLInfoType } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickSQLIDFromTagoIO } from "../../prompt/pick-sql-id-from-tagoio.js";
import { mapDate, mapTags } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  json?: boolean;
  raw?: boolean;
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Counts the saved revisions.
 *
 * `versions` is returned by the API but absent from `SQLInfo` — probed, it is a
 * map of version number to `{ created_at, created_by, version_id }`. The count
 * matters because deleting a query discards every revision with it, which is the
 * one thing re-creating the query cannot restore.
 */
function countVersions(info: SQLInfoType): number {
  const versions = (info as SQLInfoType & { versions?: Record<string, unknown> }).versions;
  return versions ? Object.keys(versions).length : 0;
}

async function sqlInfo(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickSQLIDFromTagoIO(resources);
  }

  const info = await resources.sql.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`SQL query with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    // Spread first so `cache_version`, `profile` and `versions` — all returned
    // but absent from `SQLInfo` — survive into --raw output.
    process.stdout.write(
      `${JSON.stringify({
        ...info,
        created_at: mapDate(info.created_at, options),
        updated_at: mapDate(info.updated_at, options),
      })}\n`,
    );
    return;
  }

  // Human view goes entirely to stderr. `console.table` writes to stdout, which
  // is reserved for machine-readable output.
  infoMSG(`SQL Query Found: ${info.name} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    name: info.name,
    id: info.id,
    active: info.active,
    version: info.version,
    versions: countVersions(info),
    params: info.params?.length ?? 0,
    cache_enabled: info.cache_enabled,
    cache_ttl_seconds: info.cache_ttl_seconds,
    rate_limit_rpm: info.rate_limit_rpm ?? "(plan default)",
    session_context: info.session_context,
    description: info.description,
    tags: info.tags?.length ?? 0,
    created_at: mapDate(info.created_at, options),
    updated_at: mapDate(info.updated_at, options),
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  // The query text is the point of this command, so it gets its own block rather
  // than being squeezed into a table cell.
  if (info.query) {
    infoMSG("Query:");
    for (const line of info.query.split("\n")) {
      writeStatus(`  ${line}`);
    }
  }

  if (info.params?.length) {
    infoMSG("Params:");
    for (const param of info.params) {
      writeStatus(`  ${param.key} = ${param.value}`);
    }
  }

  if (info.tags?.length) {
    infoMSG("Tags:");
    writeStatus(JSON.stringify(mapTags(info.tags, options), null, 2));
  }
}

export { countVersions, sqlInfo };
