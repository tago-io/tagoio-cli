import { Resources, type ConfigurationParams } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  set?: string[];
  sent?: boolean;
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

/** Parses `key=value` (split on the first `=` only, so values may contain `=`). */
function parseParam(input: string, sent: boolean, useJSON: boolean): ConfigurationParams {
  const splitAt = input.indexOf("=");
  if (splitAt === -1) {
    failWith(`Invalid --set "${input}". Expected key=value.`, "invalid_param", useJSON);
  }
  return { key: input.slice(0, splitAt), value: input.slice(splitAt + 1), sent };
}

async function deviceParam(idArg: string | undefined, options: IOptions) {
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

  if (options.set?.length) {
    const params = options.set.map((pair) => parseParam(pair, Boolean(options.sent), Boolean(options.json)));
    await resources.devices.paramSet(id, params).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to set params: ${message}`, "param_set_failed", Boolean(options.json));
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ id, set: params })}\n`);
      return;
    }
    successMSG(`${params.length} param(s) set on device ${id}.`);
    return;
  }

  if (options.delete) {
    const paramID = options.delete;
    await resources.devices.paramRemove(id, paramID).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to delete param: ${message}`, "param_delete_failed", Boolean(options.json));
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ id, param: paramID, deleted: true })}\n`);
      return;
    }
    successMSG(`Param ${paramID} deleted from device ${id}.`);
    return;
  }

  // Default op: list params.
  const params = await resources.devices.paramList(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to list params: ${message}`, "param_list_failed", Boolean(options.json));
  });
  if (!params) {
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(params)}\n`);
    return;
  }
  console.table(params);
  infoMSG(`${params.length} param(s) found for device ${id}.`);
}

export { deviceParam, parseParam };
