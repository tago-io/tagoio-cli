import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG } from "../../lib/messages.js";
import { pickEntityIDFromTagoIO } from "../../prompt/pick-entity-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  json?: boolean;
  stringify?: boolean;
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

async function entityInfo(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      const message = "Missing required input: id";
      if (options.json) {
        errorHandlerJSON(message, "missing_input");
      }
      errorHandler(message);
    }
    id = await pickEntityIDFromTagoIO(resources);
  }

  const info = await resources.entities.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Entity with id ${id} not found: ${message}`, "not_found", Boolean(options.json));
  });

  if (!info) {
    return;
  }

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(info)}\n`);
    return;
  }

  // Human-readable view: split metadata, schema, and indexes into three sections.
  infoMSG(`Entity Found: ${info.name} [${info.id}].`);
  const meta: Record<string, unknown> = {
    id: info.id,
    name: info.name,
    description: (info as { description?: string }).description ?? "",
    created_at: info.created_at,
    updated_at: info.updated_at,
  };
  console.table(meta);

  if (info.schema) {
    infoMSG("Schema:");
    console.table(info.schema as never);
  }
  // Some entity payloads carry an `index` map; render when present.
  const indexes = (info as { index?: Record<string, unknown> }).index;
  if (indexes && Object.keys(indexes).length > 0) {
    infoMSG("Indexes:");
    console.table(indexes);
  }
}

export { entityInfo };
