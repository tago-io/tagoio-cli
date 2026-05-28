import { Resources, type EntityCreateInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickEntityIDFromTagoIO } from "../../prompt/pick-entity-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  name?: string;
  description?: string;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

async function entityEdit(idArg: string | undefined, options: IOptions) {
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
    id = await pickEntityIDFromTagoIO(resources);
  }

  // Build the patch from only the flags the user set. Empty patch = no-op.
  const patch: Partial<EntityCreateInfo> & { description?: string } = {};
  if (options.name !== undefined) {
    patch.name = options.name;
  }
  if (options.description !== undefined) {
    patch.description = options.description;
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass at least one of --name or --description.", "noop_edit", Boolean(options.json));
  }

  await resources.entities.edit(id, patch as Partial<EntityCreateInfo>).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit entity ${id}: ${message}`, "edit_failed", Boolean(options.json));
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, ...patch })}\n`);
    return;
  }

  successMSG(`Entity ${id} updated.`);
}

export { entityEdit };
