import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickRunUserIDFromTagoIO } from "../../prompt/pick-run-user-id-from-tagoio.js";
import { mapLastTriggered } from "../actions/action-list.js";
import { mapDate, mapTags } from "../devices/device-list.js";

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

async function runUserInfo(idArg: string | undefined, options: IOptions) {
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

  const info = await resources.run.userInfo(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Run user with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    // Spread first so the fields the SDK type omits — `otp`,
    // `custom_preferences` and `agreements`, all probed as present — survive
    // into --raw output rather than being silently dropped.
    const payload = {
      ...info,
      last_login: mapLastTriggered(info.last_login, options),
      created_at: mapDate(info.created_at, options),
      updated_at: mapDate(info.updated_at, options),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  // Human view goes entirely to stderr. `console.table` writes to stdout, which
  // is reserved for machine-readable output — the leak that shipped in
  // `action-info` and was caught only by a functional test.
  infoMSG(`Run User Found: ${info.email} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    name: info.name,
    email: info.email,
    id: info.id,
    active: info.active,
    timezone: info.timezone,
    language: info.language,
    company: info.company,
    phone: info.phone,
    tags: info.tags?.length ?? 0,
    last_login: mapLastTriggered(info.last_login, options),
    created_at: mapDate(info.created_at, options),
    updated_at: mapDate(info.updated_at, options),
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

export { runUserInfo };
