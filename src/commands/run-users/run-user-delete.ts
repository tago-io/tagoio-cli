import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickRunUserIDFromTagoIO } from "../../prompt/pick-run-user-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  yes?: boolean;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Names the user in the confirmation.
 *
 * The email is the only thing an operator recognises: the id is opaque, and the
 * email is what the API itself treats as identity. Best-effort — falls back to
 * the bare id when the lookup fails, since a delete should not be blocked by a
 * failed read.
 */
async function describeTarget(resources: Resources, id: string): Promise<string> {
  const info = await resources.run.userInfo(id).catch(() => null);
  return info?.email ? `run user "${info.email}"` : `run user ${id}`;
}

/**
 * @description Builds the confirmation text. Exported so the wording is
 * assertable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * Says both consequences out loud. Unlike a secret, a run user cannot be
 * recreated identically — `created_at`, `last_login` and the password do not
 * survive, so "delete and make a new one" is not a recovery path.
 */
function buildDeleteMessage(target: string): string {
  return `Permanently delete ${target}? They lose access to the portal immediately, and the account cannot be restored.`;
}

async function runUserDelete(idArg: string | undefined, options: IOptions) {
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
    id = await pickRunUserIDFromTagoIO(resources);
  }

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const target = await describeTarget(resources, id);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: buildDeleteMessage(target),
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.run.userDelete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete run user ${id}: ${message}`, "delete_failed", options.json);
  });

  if (options.json) {
    // `run.userDelete` resolves a plain string, so the ack is synthesized.
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Run user ${id} deleted.`);
}

export { buildDeleteMessage, describeTarget, runUserDelete };
