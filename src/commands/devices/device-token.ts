import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  create?: string;
  permission?: "full" | "write" | "read";
  delete?: string;
  list?: boolean;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

async function deviceToken(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", Boolean(options.json));
    }
    id = await pickDeviceIDFromTagoIO(resources);
  }

  if (options.create) {
    const name = options.create;
    // Always pin expire_time to "never": the SDK randomly generates an
    // expiration when the field is omitted, so the default lives here.
    const created = await resources.devices
      .tokenCreate(id, { name, permission: options.permission ?? "full", expire_time: "never" })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        failWith(`Failed to create token: ${message}`, "token_create_failed", Boolean(options.json));
      });
    if (!created) {
      return;
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ token: created.token, name })}\n`);
      return;
    }
    successMSG(`Token created for device ${id}: ${created.token}`);
    return;
  }

  if (options.delete) {
    const token = options.delete;
    await resources.devices.tokenDelete(token).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to delete token: ${message}`, "token_delete_failed", Boolean(options.json));
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ token, deleted: true })}\n`);
      return;
    }
    successMSG(`Token ${token} deleted.`);
    return;
  }

  // Default op: list tokens.
  const tokens = await resources.devices.tokenList(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to list tokens: ${message}`, "token_list_failed", Boolean(options.json));
  });
  if (!tokens) {
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(tokens)}\n`);
    return;
  }
  console.table(tokens);
  infoMSG(`${tokens.length} token(s) found for device ${id}.`);
}

export { deviceToken };
