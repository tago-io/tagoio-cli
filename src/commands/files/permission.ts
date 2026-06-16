import { queue } from "async";

import { isFolderPath, listFilesRecursive } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { CONCURRENCY, DELAY_BETWEEN_REQUESTS_MS } from "../../lib/upload-folder.js";
import { confirmPrompt } from "../../prompt/confirm.js";
import { resolveResources } from "../../lib/resolve-resources.js";

interface PermissionOptions {
  environment?: string;
  token?: string;
  /** Skip the confirmation prompt for folder-wide changes (CI/CD). */
  yes?: boolean;
  silent?: boolean;
}

/** Makes a file or folder prefix public or private. */
async function filesPermissionCommand(path: string, visibility: string, options: PermissionOptions) {
  if (visibility !== "public" && visibility !== "private") {
    errorHandler(`Visibility must be 'public' or 'private', got '${visibility}'.`);
  }
  const isPublic = visibility === "public";

  const { resources } = resolveResources(options);

  if (!isFolderPath(path)) {
    await resources.files.changePermission([{ file: path, public: isPublic }]);
    successMSG(`Set ${path} to ${visibility}.`);
    return;
  }

  const files = await listFilesRecursive(resources, path);
  if (files.length === 0) {
    errorHandler(`No files found under '${path}'.`);
  }

  if (files.length > 1 && !options.yes && !options.silent) {
    const ok = await confirmPrompt(`Set ${files.length} file(s) under '${path}' to ${visibility}?`);
    if (!ok) {
      infoMSG("Cancelled.");
      return;
    }
  }

  const permQueue = queue<string>(async (file) => {
    await resources.files.changePermission([{ file, public: isPublic }]);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }, CONCURRENCY);

  for (const file of files) {
    void permQueue.push(file);
  }
  await permQueue.drain();

  successMSG(`Set ${files.length} file(s) to ${visibility}.`);
}

export { filesPermissionCommand };
