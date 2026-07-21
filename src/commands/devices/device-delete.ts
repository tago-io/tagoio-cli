import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  silent?: boolean;
  json?: boolean;
  yes?: boolean;
}

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

async function deviceDelete(idArg: string | undefined, options: IOptions) {
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

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Permanently delete device ${id}? This cannot be undone.`,
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.devices.delete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete device ${id}: ${message}`, "delete_failed", Boolean(options.json));
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Device ${id} deleted.`);
}

export { deviceDelete };
