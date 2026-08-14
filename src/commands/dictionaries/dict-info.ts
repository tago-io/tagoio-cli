import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickDictionaryIDFromTagoIO } from "../../prompt/pick-dictionary-id-from-tagoio.js";
import { mapDate } from "../devices/device-list.js";

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

async function dictInfo(idArg: string | undefined, options: IOptions) {
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

  const info = await resources.dictionaries.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dictionary with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    const payload = {
      ...info,
      // The API omits `id` from this payload, unlike actions and devices, so it
      // is filled in from the id we asked for — otherwise a machine reader has
      // no way to identify what it just read. Placed after the spread so it
      // wins whether or not the API sent one.
      id,
      created_at: mapDate(info.created_at, options),
      updated_at: mapDate(info.updated_at, options),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  // Human view goes entirely to stderr. `console.table` writes to stdout, which
  // is reserved for machine-readable output — the leak that shipped in
  // `action-info` and was caught only by a functional test.
  infoMSG(`Dictionary Found: ${info.name} [${id}].`);
  const scalars: Record<string, unknown> = {
    name: info.name,
    id,
    slug: info.slug,
    fallback: info.fallback,
    languages: info.languages?.length ?? 0,
    created_at: mapDate(info.created_at, options),
    updated_at: mapDate(info.updated_at, options),
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  if (info.languages?.length) {
    infoMSG("Languages:");
    for (const language of info.languages) {
      writeStatus(`  ${language.code}  ${language.active ? "active" : "inactive"}`);
    }
  }
}

export { dictInfo };
