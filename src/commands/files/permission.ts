import { isFolderPath, listFilesRecursive, runFileBatch } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
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
    await resources.files.changePermission([{ file: path, public: isPublic }]).catch((error) => {
      errorHandler(`Failed to set permission on '${path}': ${error?.message ?? error}`);
    });
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

  const { succeeded, failed } = await runFileBatch(files, (file) => resources.files.changePermission([{ file, public: isPublic }]));

  if (failed > 0) {
    errorHandler(`Set ${succeeded} file(s) to ${visibility}, ${failed} failed.`);
  }
  successMSG(`Set ${succeeded} file(s) to ${visibility}.`);
}

export { filesPermissionCommand };
