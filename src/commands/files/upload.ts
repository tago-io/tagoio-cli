import { existsSync } from "node:fs";
import { basename } from "node:path";

import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { uploadFolder } from "../../lib/upload-folder.js";

interface UploadOptions {
  environment?: string;
  /** Profile token for this invocation, bypassing the lock file (CI/CD). */
  token?: string;
  /** Make every uploaded file public. */
  public?: boolean;
}

/**
 * Uploads a local file or folder to TagoIO Files under `remotePath`.
 * Generic command: makes no assumption about what is being uploaded.
 */
async function uploadFilesCommand(localPath: string, remotePath: string | undefined, options: UploadOptions) {
  if (!localPath || !existsSync(localPath)) {
    errorHandler(`Local path not found: ${localPath}`);
  }

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

  const destination = remotePath || basename(localPath);
  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  infoMSG(`Uploading ${localPath} to ${destination} ...`);
  const { created, failed } = await uploadFolder({
    resources,
    localPath,
    remotePath: destination,
    public: Boolean(options.public),
  });

  successMSG(`Upload complete: ${created} uploaded, ${failed} failed`);
}

export { uploadFilesCommand };
