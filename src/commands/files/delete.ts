import { isFolderPath, listFilesRecursive } from "../../lib/files-paths.js";
import { infoMSG, successMSG } from "../../lib/messages.js";
import { DELAY_BETWEEN_REQUESTS_MS } from "../../lib/upload-folder.js";
import { confirmPrompt } from "../../prompt/confirm.js";
import { resolveResources } from "./move.js";

interface DeleteOptions {
  environment?: string;
  token?: string;
  /** Skip the confirmation prompt (CI/CD). */
  yes?: boolean;
  silent?: boolean;
}

/** files.delete accepts a list; delete in batches to bound request size. */
const DELETE_BATCH_SIZE = 50;

/** Deletes a file or every file under a folder prefix, after confirmation. */
async function filesDeleteCommand(path: string, options: DeleteOptions) {
  const resources = resolveResources(options);

  const targets = isFolderPath(path) ? await listFilesRecursive(resources, path) : [path];

  if (targets.length === 0) {
    infoMSG(`No files found under '${path}'. Nothing to delete.`);
    return;
  }

  const skipConfirm = Boolean(options.yes || options.silent);
  if (!skipConfirm) {
    const ok = await confirmPrompt(`Delete ${targets.length} file(s) under '${path}'? This cannot be undone.`);
    if (!ok) {
      infoMSG("Cancelled.");
      return;
    }
  }

  for (let i = 0; i < targets.length; i += DELETE_BATCH_SIZE) {
    const batch = targets.slice(i, i + DELETE_BATCH_SIZE);
    await resources.files.delete(batch);
    if (i + DELETE_BATCH_SIZE < targets.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
    }
  }

  successMSG(`Deleted ${targets.length} file(s).`);
}

export { filesDeleteCommand };
