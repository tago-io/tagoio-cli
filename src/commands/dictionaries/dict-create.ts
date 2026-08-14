import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { assertLocaleShape, assertSlugShape } from "./language-content.js";

interface IOptions {
  environment?: string;
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

async function dictCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // All three fields are required by the API, so each prompts when interactive
  // and fails fast under --silent.
  const requireOpts = { silent: options.silent, json: options.json };
  const name = await requireOrFail(nameArg, "name", { ...requireOpts, promptMessage: "Dictionary name:" });
  const slug = await requireOrFail(options.slug, "slug", { ...requireOpts, promptMessage: "Dictionary slug:" });
  const fallback = await requireOrFail(options.fallback, "fallback", {
    ...requireOpts,
    promptMessage: "Fallback language (e.g. en-US):",
  });

  assertSlugShape(slug, "--slug", options);
  assertLocaleShape(fallback, "--fallback", options);

  const created = await resources.dictionaries.create({ name, slug, fallback }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create dictionary: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  // The SDK resolves { dictionary: "<id>" } here — not { id }, and not the
  // { device_id } / { action } shapes the other families return.
  const id = created.dictionary;

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, name, slug })}\n`);
    return;
  }

  successMSG(`Dictionary created: ${name} [${id}].`);
}

export { dictCreate };
