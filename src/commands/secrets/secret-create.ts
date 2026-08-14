import { Resources, type SecretsCreate } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { normalizeSecretKey } from "./secret-key.js";
import { resolveSecretValue } from "./secret-value.js";

interface IOptions {
  environment?: string;
  tagkey?: string[];
  tagvalue?: string[];
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function secretCreate(keyArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const rawKey = await requireOrFail(keyArg, "key", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Secret key:",
  });

  // The API uppercases the key and refuses anything but letters, digits and
  // underscores. Normalizing here keeps --json honest about what was stored.
  const key = normalizeSecretKey(rawKey, options);

  // The API rejects a duplicate key with "Sorry, Internal Error" — the same
  // message it gives for a value that is too short and for a full quota, so the
  // caller cannot tell which happened. Checking first turns that into something
  // actionable. `restoreSecrets` pre-checks for the same reason.
  //
  // Deliberately before the prompt: there is no point asking for a credential
  // that is about to be thrown away. A failing lookup is ignored — the API
  // stays the authority, and a listing outage must not block a create.
  const existing = await resources.secrets.list({ amount: 10000, fields: ["id", "key"] }).catch(() => null);
  const clash = existing?.find((secret) => secret.key === key);
  if (clash) {
    // Names what already exists, then the rule that makes it a conflict — the
    // API's own "Sorry, Internal Error" conveys neither.
    failWith(`A secret ${key} already exists. Secret keys must be unique within a profile.`, "key_exists", options.json);
  }

  // The only input for the value. No flag carries it, so this command cannot
  // run under --silent — resolveSecretValue reports that explicitly.
  const value = await resolveSecretValue(options, `Value for ${key}:`);

  // `-k` / `-v` keep their family meaning of tag key and tag value. Worth
  // noting because a `-v` short form on the value would have written the
  // credential into a tag, which `secret-list` prints in the clear.
  const tags = buildTags(options.tagkey, options.tagvalue);

  const payload: SecretsCreate = { key, value, ...(tags ? { tags } : {}) };

  const created = await resources.secrets.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // Only the API's message is reported. Echoing the payload here would put
    // the credential into whatever captured the error.
    failWith(`Failed to create secret ${key}: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  if (options.json) {
    // value_length rather than the value: it is the only observable proof the
    // value landed, and the API itself never returns more than this.
    process.stdout.write(`${JSON.stringify({ id: created.id, key, value_length: value.length })}\n`);
    return;
  }

  successMSG(`Secret created: ${key} [${created.id}] (${value.length} characters).`);
}

export { secretCreate };
