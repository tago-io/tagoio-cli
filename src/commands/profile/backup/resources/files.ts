import { join } from "node:path";

import type { Resources } from "@tago-io/sdk";
import ora from "ora";

import { highlightMSG, infoMSG } from "../../../../lib/messages.js";
import { collectFiles, type FileTask, uploadFiles } from "../../../../lib/upload-folder.js";
import { selectItemsFromBackup } from "../lib.js";
import type { RestoreResult } from "../types.js";

/** Restores files from backup. */
async function restoreFiles(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const filesDir = join(extractDir, "files");

  infoMSG("Reading files from backup...");
  let fileTasks = collectFiles(filesDir, filesDir);

  if (fileTasks.length === 0) {
    infoMSG("No files found in backup.");
    return { created: 0, updated: 0, failed: 0 };
  }

  if (granularItem) {
    const itemsWithName = fileTasks.map((f) => ({ ...f, id: f.relativePath, name: f.relativePath }));
    const selected = await selectItemsFromBackup(itemsWithName, "files");
    if (!selected || selected.length === 0) {
      infoMSG("No files selected. Skipping.");
      return { created: 0, updated: 0, failed: 0 };
    }
    fileTasks = selected as FileTask[];
  }

  infoMSG(`Restoring ${highlightMSG(fileTasks.length.toString())} files...`);

  process.stderr.write("\n");
  const spinner = ora("Uploading files...").start();

  const { created, failed } = await uploadFiles({
    resources,
    tasks: fileTasks,
    remotePath: "",
    public: false,
    onProgress: (counts) => {
      spinner.text = `Uploading files... (${counts.created} uploaded, ${counts.failed} failed)`;
    },
  });

  spinner.succeed(`Files uploaded: ${created} uploaded, ${failed} failed`);

  return { created, updated: 0, failed };
}

export { restoreFiles };
