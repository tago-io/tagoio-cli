import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickActionIDFromTagoIO } from "../../prompt/pick-action-id-from-tagoio.js";
import { mapDate, mapTags } from "../devices/device-list.js";
import { mapLastTriggered } from "./action-list.js";

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

async function actionInfo(idArg: string | undefined, options: IOptions) {
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
    id = await pickActionIDFromTagoIO(resources);
  }

  const info = await resources.actions.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Action with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    const payload = {
      ...info,
      created_at: mapDate(info.created_at, options),
      updated_at: mapDate(info.updated_at, options),
      last_triggered: mapLastTriggered(info.last_triggered, options),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  // Human view: everything goes to stderr, so `action-info` without --json
  // pipes to nothing and stdout stays reserved for machine-readable data.
  // `console.table` is deliberately not used here — it writes to stdout.
  infoMSG(`Action Found: ${info.name} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    name: info.name,
    id: info.id,
    type: info.type,
    active: info.active,
    tags: info.tags?.length ?? 0,
    last_triggered: mapLastTriggered(info.last_triggered, options),
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

  // A table cannot render these legibly — they are discriminated unions whose
  // shape varies per action type.
  infoMSG("Trigger:");
  writeStatus(JSON.stringify(info.trigger ?? [], null, 2));

  infoMSG("Action:");
  writeStatus(JSON.stringify(info.action, null, 2));
}

export { actionInfo };
