import { Resources, type SQLExecuteObj } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, writeStatus } from "../../lib/messages.js";
import { pickSQLIDFromTagoIO } from "../../prompt/pick-sql-id-from-tagoio.js";
import { parseSQLParams } from "./sql-payload.js";
import { buildFooter, renderRows } from "./sql-render.js";

interface IOptions {
  environment?: string;
  param?: string[];
  test?: boolean;
  afterDevice?: string;
  stringify?: boolean;
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

async function sqlExecute(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  // Parsed before the call so a malformed pair costs no execution — and an
  // execution is not free: it counts against the profile's Data Output limit.
  const params = parseSQLParams(options.param ?? [], options);

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickSQLIDFromTagoIO(resources);
  }

  // `params` is omitted rather than sent empty: probed, a query whose `$1`
  // defaults to `%` returned every row when executed with none, so omitting is
  // what lets the saved defaults apply.
  const payload: SQLExecuteObj = {
    ...(params ? { params } : {}),
    ...(options.test ? { test: true } : {}),
    ...(options.afterDevice ? { after_device: options.afterDevice } : {}),
  };

  const result = await resources.sql.execute(id, payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // The API's message is forwarded intact — `SQL query is inactive` for a
    // disabled query, or the parser's own complaint.
    failWith(`Failed to execute SQL query ${id}: ${message}`, "execute_failed", options.json);
  });

  if (!result) {
    return;
  }

  // Machine modes emit the whole result — columns, rows and the metadata — with
  // the rows left exactly as the API sent them, so a consumer gets real numbers
  // rather than the display strings the human renderer produces.
  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  // The sharpest stream split in this CLI: the rows are the data and go to
  // stdout through `console.table`; the timing is metadata about fetching them
  // and goes to stderr. A pipeline reading rows must not have to strip a footer.
  renderRows(result);
  writeStatus(buildFooter(result));
}

export { sqlExecute };
