import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickSQLIDFromTagoIO } from "../../prompt/pick-sql-id-from-tagoio.js";
import { countVersions } from "./sql-info.js";

interface IOptions {
  environment?: string;
  yes?: boolean;
  silent?: boolean;
  json?: boolean;
}

interface QueryScope {
  label: string;
  versions: number;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Reads the query's name and how many revisions it carries.
 *
 * Best-effort: a failed lookup falls back to the bare id with zero versions,
 * since a delete should not be blocked by a failed read.
 */
async function describeTarget(resources: Resources, id: string): Promise<QueryScope> {
  const info = await resources.sql.info(id).catch(() => null);
  return {
    label: info?.name ? `SQL query "${info.name}"` : `SQL query ${id}`,
    versions: info ? countVersions(info) : 0,
  };
}

/**
 * @description Builds the confirmation text. Exported so the wording is
 * assertable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * The version count is the part worth naming. Re-creating a query restores the
 * SQL, but not its history — a query at version 9 takes nine saved revisions
 * with it, and nothing in the CLI or the admin brings those back.
 */
function buildDeleteMessage(target: string, versions: number): string {
  const revisions = `${versions} version${versions === 1 ? "" : "s"}`;
  return `Permanently delete ${target}? Its ${revisions} of history go with it, and re-creating the query cannot restore them.`;
}

async function sqlDelete(idArg: string | undefined, options: IOptions) {
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

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const scope = await describeTarget(resources, id);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: buildDeleteMessage(scope.label, scope.versions),
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.sql.delete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete SQL query ${id}: ${message}`, "delete_failed", options.json);
  });

  if (options.json) {
    // `sql.delete` resolves `{ id }`; the ack is synthesized to match the shape
    // every other family in this CLI reports.
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`SQL query ${id} deleted.`);
}

export { buildDeleteMessage, describeTarget, sqlDelete };
