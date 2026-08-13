import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";
import { pickActionIDFromTagoIO } from "../../prompt/pick-action-id-from-tagoio.js";
import { applyActionEdit } from "./action-edit.js";

interface IOptions {
  environment?: string;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Flips an action's `active` flag. Shared by `action-enable` and
 * `action-disable`, which exist as separate commands because toggling is the
 * most common action operation and reads better than `action-edit --inactive`.
 *
 * Sends only `{ active }` — nothing else on the action is touched.
 */
async function toggleAction(idArg: string | undefined, options: IOptions, active: boolean) {
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

  await applyActionEdit(resources, id, { active }, { json: options.json });
}

const actionEnable = (idArg: string | undefined, options: IOptions) => toggleAction(idArg, options, true);
const actionDisable = (idArg: string | undefined, options: IOptions) => toggleAction(idArg, options, false);

export { actionDisable, actionEnable };
