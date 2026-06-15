import { Resources } from "@tago-io/sdk";

import { getApiURL, getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler } from "../../lib/messages.js";

interface URLOptions {
  environment?: string;
  /** Profile token for this invocation, bypassing the lock file (CI/CD). */
  token?: string;
  /** Return a signed URL for a private file. */
  signed?: boolean;
}

/**
 * Prints the URL of a file already in TagoIO Files. The URL goes to stdout so
 * it can be captured in scripts; everything else stays on stderr.
 */
async function filesURLCommand(remotePath: string, options: URLOptions) {
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
  const profile = await resources.profiles.info("current");

  const cleanPath = remotePath.replace(/^\/+/, "");
  const publicURL = `${getApiURL(config.profileRegion)}/file/${profile.info.id}/${cleanPath}`;

  const url = options.signed ? await resources.files.getFileURLSigned(publicURL) : publicURL;

  process.stdout.write(`${url}\n`);
}

export { filesURLCommand };
