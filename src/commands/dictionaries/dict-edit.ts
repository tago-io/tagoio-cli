import { type DictionaryCreateInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickDictionaryIDFromTagoIO } from "../../prompt/pick-dictionary-id-from-tagoio.js";
import { assertLocaleShape, assertSlugShape } from "./language-content.js";

interface IOptions {
  environment?: string;
  name?: string;
  slug?: string;
  fallback?: string;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function dictEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.slug !== undefined) {
    assertSlugShape(options.slug, "--slug", options);
  }
  if (options.fallback !== undefined) {
    assertLocaleShape(options.fallback, "--fallback", options);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickDictionaryIDFromTagoIO(resources);
  }

  // Build the patch from only the flags the caller actually set.
  const patch: Partial<DictionaryCreateInfo> = {};
  if (options.name !== undefined) {
    patch.name = options.name;
  }
  if (options.slug !== undefined) {
    patch.slug = options.slug;
  }
  if (options.fallback !== undefined) {
    patch.fallback = options.fallback;
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass at least one field to edit.", "no_changes", options.json);
  }

  await resources.dictionaries.edit(id, patch).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit dictionary ${id}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Dictionary ${id} updated.`);
}

export { dictEdit };
