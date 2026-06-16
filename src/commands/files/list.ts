import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler } from "../../lib/messages.js";

interface ListOptions {
  environment?: string;
  token?: string;
  /** Emit a JSON object on stdout for machine readers. */
  json?: boolean;
}

/** Lists files and folders under a path in TagoIO Files. */
async function filesListCommand(path: string | undefined, options: ListOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config) {
    errorHandler("Environment not found");
  }

  if (options.token) {
    config.profileToken = options.token;
  }
  if (!config.profileToken) {
    errorHandler("No profile token found. Pass --token or run 'tagoio login'.");
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const result = await resources.files.list({ path: path ?? "" });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ folders: result.folders, files: result.files })}\n`);
    return;
  }

  for (const folder of result.folders) {
    process.stdout.write(`${folder}/\n`);
  }
  for (const file of result.files) {
    process.stdout.write(`${file.filename}\n`);
  }
}

export { filesListCommand };
