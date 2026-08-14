import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickSecretIDFromTagoIO } from "../../prompt/pick-secret-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  silent?: boolean;
  json?: boolean;
  yes?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Builds the confirmation text, naming the secret's key.
 *
 * The key is the only thing an operator recognises: the id is opaque and the
 * value was never readable. Best-effort — falls back to the bare id when the
 * lookup fails, since a delete should not be blocked by a failed read.
 */
async function describeTarget(resources: Resources, id: string): Promise<string> {
  const info = await resources.secrets.info(id).catch(() => null);
  return info?.key ? `secret "${info.key}"` : `secret ${id}`;
}

async function secretDelete(idArg: string | undefined, options: IOptions) {
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
    id = await pickSecretIDFromTagoIO(resources);
  }

  // Destructive op: confirm unless --silent or -y. The value cannot be recovered
  // afterwards — it was never readable — and every Action or Analysis
  // referencing this secret stops working.
  if (!options.silent && !options.yes) {
    const target = await describeTarget(resources, id);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Permanently delete ${target}? The value cannot be recovered, and anything referencing it will break.`,
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.secrets.delete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete secret ${id}: ${message}`, "delete_failed", options.json);
  });

  if (options.json) {
    // `secrets.delete` resolves a plain string, so the ack is synthesized.
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Secret ${id} deleted.`);
}

export { secretDelete };
