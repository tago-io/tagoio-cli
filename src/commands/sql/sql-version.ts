import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickSQLIDFromTagoIO } from "../../prompt/pick-sql-id-from-tagoio.js";
import { mapDate } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  rev?: number;
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
 * @description Reads one historical revision of a query.
 *
 * A version is taken when the SQL text changes — probed: a rename left the
 * version alone, while two successive query changes moved it 1 → 2 → 3. The
 * history versions the query, not its metadata, so an edit that broke a
 * dashboard can be traced to the revision that did it and the old SQL recovered
 * by hand.
 *
 * The flag is `--rev` rather than `--version`: `program.version()` in
 * `src/index.ts` claims `--version` globally, so commander would answer it with
 * the CLI's own version and exit before this command ran. Found by running the
 * real parser — a unit test calling this function directly cannot see it.
 *
 * Read-only on purpose: there is no rollback endpoint. Restoring an old version
 * means copying its text into `sql-edit --query`, which takes a new version of
 * its own rather than rewinding — and `--help` says so instead of implying a
 * restore that does not exist.
 */
async function sqlVersion(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.rev === undefined) {
    failWith("Missing required input: --rev", "missing_input", options.json);
  }

  // Versions are 1-based, so 0 and a non-number are caller mistakes worth
  // catching before the round trip.
  if (!Number.isInteger(options.rev) || options.rev < 1) {
    failWith(`Invalid --rev "${options.rev}". Versions start at 1.`, "invalid_version", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickSQLIDFromTagoIO(resources);
  }

  const result = await resources.sql.getVersion(id, options.rev).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Version ${options.rev} of SQL query ${id} not found: ${message}`, "version_not_found", options.json);
  });

  if (!result) {
    return;
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        ...result,
        created_at: result.created_at ? mapDate(result.created_at, options) : null,
      })}\n`,
    );
    return;
  }

  infoMSG(`SQL query ${id} — version ${options.rev}:`);
  if (result.created_at) {
    writeStatus(`  saved at  ${mapDate(result.created_at, options)}`);
  }

  infoMSG("Query:");
  for (const line of result.query.split("\n")) {
    writeStatus(`  ${line}`);
  }

  if (result.params?.length) {
    infoMSG("Params:");
    for (const param of result.params) {
      writeStatus(`  ${param.key} = ${param.value}`);
    }
  }
}

export { sqlVersion };
