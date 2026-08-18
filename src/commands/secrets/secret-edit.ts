import { Resources, type SecretsEdit } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickSecretIDFromTagoIO } from "../../prompt/pick-secret-id-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { resolveSecretValue } from "./secret-value.js";

interface IOptions {
  environment?: string;
  key?: string;
  rotate?: boolean;
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

async function secretEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  // `SecretsEdit` has no `key` field: the API cannot rename a secret. Failing
  // here beats a confusing rejection from the server.
  if (options.key !== undefined) {
    failWith("A secret's key cannot be changed. Delete the secret and create it again under the new key.", "immutable_key", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickSecretIDFromTagoIO(resources);
  }

  const patch: SecretsEdit = {};

  if (options.rotate) {
    // The value has one input, so this path cannot run under --silent.
    patch.value = await resolveSecretValue(options, "New value:");
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    if (options.mergeTags) {
      const info = await resources.secrets.info(id);
      patch.tags = mergeTags(info?.tags ?? [], incoming);
    } else {
      patch.tags = incoming;
    }
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass --rotate to change the value, or tags to change them.", "no_changes", options.json);
  }

  await resources.secrets.edit(id, patch).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // The API's message only. Echoing the patch would put the new value into
    // whatever captured the error.
    failWith(`Failed to edit secret ${id}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    // `secrets.edit` resolves a plain string ("Successfully Updated"), so the
    // ack is synthesized, as `dict-delete` does with its own.
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Secret ${id} updated.`);
}

export { secretEdit };
