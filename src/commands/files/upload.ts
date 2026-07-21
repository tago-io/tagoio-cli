import { existsSync } from "node:fs";
import { basename } from "node:path";

import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveResources } from "../../lib/resolve-resources.js";
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

  const { resources } = resolveResources(options);
  const destination = remotePath || basename(localPath);

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
