import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickSecretIDFromTagoIO } from "../../prompt/pick-secret-id-from-tagoio.js";
import { mapTags } from "../devices/device-list.js";
import { mapSecretDate } from "./secret-list.js";

interface IOptions {
  environment?: string;
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

async function secretInfo(idArg: string | undefined, options: IOptions) {
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

  const info = await resources.secrets.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Secret with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    const payload = {
      ...info,
      created_at: mapSecretDate(info.created_at, options),
      updated_at: mapSecretDate(info.updated_at, options),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  // Human view goes entirely to stderr. `console.table` writes to stdout, which
  // is reserved for machine-readable output — the leak that shipped in
  // `action-info` and was caught only by a functional test.
  //
  // `value_length` is the closest thing to the value that exists: the API never
  // returns the value itself, so there is nothing here to redact.
  infoMSG(`Secret Found: ${info.key} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    key: info.key,
    id: info.id,
    value_length: info.value_length,
    tags: info.tags?.length ?? 0,
    created_at: mapSecretDate(info.created_at, options),
    updated_at: mapSecretDate(info.updated_at, options),
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  if (info.tags?.length) {
    infoMSG("Tags:");
    writeStatus(JSON.stringify(mapTags(info.tags, options), null, 2));
  }
}

export { secretInfo };
