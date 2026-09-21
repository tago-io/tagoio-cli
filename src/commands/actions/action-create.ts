import { type ActionCreateInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { type ActionTypeName, buildActionTarget, buildTrigger, type BuilderOptions } from "./action-builders.js";

interface IOptions extends BuilderOptions {
  environment?: string;
  type?: ActionTypeName;
  description?: string;
  inactive?: boolean;
  tagkey?: string[];
  tagvalue?: string[];
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function actionCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const name = await requireOrFail(nameArg, "name", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Action name:",
  });

  // All validation lives in the builders, so an invalid invocation fails here
  // without ever reaching the API.
  const type = options.type ?? "condition";
  const trigger = buildTrigger(type, options);
  const action = buildActionTarget(options);
  const tags = buildTags(options.tagkey, options.tagvalue);

  const payload: ActionCreateInfo = {
    name,
    type,
    active: !options.inactive,
    trigger,
    action,
    ...(options.description ? { description: options.description } : {}),
    ...(tags ? { tags } : {}),
  };

  const created = await resources.actions.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create action: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  // The SDK resolves { action: "<id>" } here — not { id }, and not the
  // { device_id } shape devices.create uses.
  const id = created.action;

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, name })}\n`);
    return;
  }

  successMSG(`Action created: ${name} [${id}].`);
}

export { actionCreate };
