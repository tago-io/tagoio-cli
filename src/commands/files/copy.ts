import { isFolderPath, listFilesRecursive, remapPrefix, runFileBatch } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveResources } from "../../lib/resolve-resources.js";

interface CopyOptions {
  environment?: string;
  token?: string;
}

/** Copies a file or folder prefix to a new path. */
async function filesCopyCommand(from: string, to: string, options: CopyOptions) {
  const { resources } = resolveResources(options);
  infoMSG(`Copying ${from} -> ${to} ...`);

  if (!isFolderPath(from)) {
    await resources.files.copy([{ from, to }]).catch((error) => {
      errorHandler(`Failed to copy '${from}': ${error?.message ?? error}`);
    });
    successMSG("Copied 1 file.");
    return;
  }

  const files = await listFilesRecursive(resources, from);
  if (files.length === 0) {
    errorHandler(`No files found under '${from}'.`);
  }

  const { succeeded, failed } = await runFileBatch(files, (filePath) => resources.files.copy([{ from: filePath, to: remapPrefix(filePath, from, to) }]));

  if (failed > 0) {
    errorHandler(`Copied ${succeeded} file(s), ${failed} failed.`);
  }
  successMSG(`Copied ${succeeded} file(s).`);
}

export { filesCopyCommand };
