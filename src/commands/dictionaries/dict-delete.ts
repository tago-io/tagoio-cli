import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickDictionaryIDFromTagoIO } from "../../prompt/pick-dictionary-id-from-tagoio.js";

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
 * @description Builds the confirmation text, naming the dictionary and how many
 * languages go with it. Deleting takes every translation along, so the count is
 * the number that matters. Falls back to the bare id when info cannot be read.
 */
async function describeTarget(resources: Resources, id: string): Promise<string> {
  const info = await resources.dictionaries.info(id).catch(() => null);
  if (!info) {
    return `dictionary ${id}`;
  }
  const languages = info.languages?.length ?? 0;
  return languages > 0 ? `dictionary "${info.name}" and its ${languages} language(s)` : `dictionary "${info.name}"`;
}

async function dictDelete(idArg: string | undefined, options: IOptions) {
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
    id = await pickDictionaryIDFromTagoIO(resources);
  }

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const target = await describeTarget(resources, id);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Permanently delete ${target}? This cannot be undone.`,
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.dictionaries.delete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete dictionary ${id}: ${message}`, "delete_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Dictionary ${id} deleted.`);
}

export { dictDelete };
