import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage } from "../lib";
import { RestoreResult } from "../types";

interface FileTask {
  filePath: string;
  relativePath: string;
}

const CONCURRENCY = 2;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Recursively collects all files from a directory. */
function collectFiles(dir: string, baseDir: string): FileTask[] {
  const files: FileTask[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else if (stat.isFile()) {
      const relativePath = "/" + relative(baseDir, fullPath);
      files.push({ filePath: fullPath, relativePath });
    }
  }

  return files;
}

/** Processes a single file upload task. */
async function processUploadTask(
  resources: Resources,
  task: FileTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  try {
    const fileContent = readFileSync(task.filePath);
    const base64Content = fileContent.toString("base64");

    await resources.files.uploadBase64([
      {
        filename: task.relativePath,
        file: base64Content,
        public: false,
      },
    ]);

    result.created++;
    spinner.text = `Uploading files... (${result.created} uploaded, ${result.failed} failed)`;

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to upload file "${task.relativePath}": ${getErrorMessage(error)}`);
  }
}

/** Restores files from backup. */
async function restoreFiles(resources: Resources, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  const filesDir = join(extractDir, "files");

  infoMSG("Reading files from backup...");
  const fileTasks = collectFiles(filesDir, filesDir);

  if (fileTasks.length === 0) {
    infoMSG("No files found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(fileTasks.length.toString())} files in backup.`);

  console.info("");
  const spinner = ora("Uploading files...").start();

  const uploadQueue = queue<FileTask>(async (task) => {
    await processUploadTask(resources, task, result, spinner);
  }, CONCURRENCY);

  uploadQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const task of fileTasks) {
    void uploadQueue.push(task);
  }

  if (fileTasks.length > 0) {
    await uploadQueue.drain();
  }

  spinner.succeed(`Files uploaded: ${result.created} uploaded, ${result.failed} failed`);

  return result;
}

export { restoreFiles };
