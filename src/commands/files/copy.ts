import { queue } from "async";

import { isFolderPath, listFilesRecursive, remapPrefix } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { CONCURRENCY, DELAY_BETWEEN_REQUESTS_MS } from "../../lib/upload-folder.js";
import { resolveResources } from "./move.js";

interface CopyOptions {
  environment?: string;
  token?: string;
}

/** Copies a file or folder prefix to a new path. */
async function filesCopyCommand(from: string, to: string, options: CopyOptions) {
  const resources = resolveResources(options);
  infoMSG(`Copying ${from} -> ${to} ...`);

  if (!isFolderPath(from)) {
    await resources.files.copy([{ from, to }]);
    successMSG("Copied 1 file.");
    return;
  }

  const files = await listFilesRecursive(resources, from);
  if (files.length === 0) {
    errorHandler(`No files found under '${from}'.`);
  }

  const copyQueue = queue<string>(async (filePath) => {
    await resources.files.copy([{ from: filePath, to: remapPrefix(filePath, from, to) }]);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }, CONCURRENCY);

  for (const filePath of files) {
    void copyQueue.push(filePath);
  }
  await copyQueue.drain();

  successMSG(`Copied ${files.length} file(s).`);
}

export { filesCopyCommand };
