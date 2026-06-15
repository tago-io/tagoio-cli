import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { Resources } from "@tago-io/sdk";
import { queue } from "async";

interface FileTask {
  filePath: string;
  relativePath: string;
}

interface UploadFilesParams {
  resources: Resources;
  /** Files to upload, already collected (and optionally filtered). */
  tasks: FileTask[];
  /** Destination prefix in TagoIO Files (no leading slash). Empty keeps the relative path at the root. */
  remotePath: string;
  /** Make every uploaded file public. */
  public: boolean;
  /** Called after each file resolves, with the running counts. */
  onProgress?: (counts: UploadResult) => void;
}

interface UploadFolderParams {
  resources: Resources;
  /** Local file or directory to upload. */
  localPath: string;
  /** Destination prefix in TagoIO Files (no leading slash). */
  remotePath: string;
  /** Make every uploaded file public. */
  public: boolean;
  /** Called after each file resolves, with the running counts. */
  onProgress?: (counts: UploadResult) => void;
}

interface UploadResult {
  created: number;
  failed: number;
}

const CONCURRENCY = 2;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Recursively collects all files under `dir`, rooting each relative path at `baseDir`. */
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
      const relativePath = relative(baseDir, fullPath);
      files.push({ filePath: fullPath, relativePath });
    }
  }

  return files;
}

/** Uploads a single file as base64 under the remote prefix. */
async function uploadOne(params: UploadFilesParams, task: FileTask, result: UploadResult) {
  const base64Content = readFileSync(task.filePath).toString("base64");
  const filename = `/${join(params.remotePath, task.relativePath)}`;

  await params.resources.files
    .uploadBase64([{ filename, file: base64Content, public: params.public }])
    .then(() => {
      result.created++;
    })
    .catch(() => {
      result.failed++;
    });

  params.onProgress?.(result);
  await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
}

/**
 * Uploads a pre-collected list of files to TagoIO Files under `remotePath`,
 * throttled to respect rate limits. A per-file failure is counted, not fatal.
 * Callers that need to filter (e.g. granular backup restore) collect and filter
 * with `collectFiles`, then pass the result here.
 */
async function uploadFiles(params: UploadFilesParams): Promise<UploadResult> {
  const result: UploadResult = { created: 0, failed: 0 };

  if (params.tasks.length === 0) {
    return result;
  }

  const uploadQueue = queue<FileTask>(async (task) => {
    await uploadOne(params, task, result);
  }, CONCURRENCY);

  for (const task of params.tasks) {
    void uploadQueue.push(task);
  }

  await uploadQueue.drain();

  return result;
}

/**
 * Uploads a local file or directory to TagoIO Files under `remotePath`. Sugar
 * over `collectFiles` + `uploadFiles`. For a directory, `remotePath` is the
 * prefix and each file keeps its relative path. For a single file, `remotePath`
 * is the full destination path (the relative path is empty).
 */
async function uploadFolder(params: UploadFolderParams): Promise<UploadResult> {
  if (!existsSync(params.localPath)) {
    return { created: 0, failed: 0 };
  }

  const tasks = statSync(params.localPath).isDirectory()
    ? collectFiles(params.localPath, params.localPath)
    : [{ filePath: params.localPath, relativePath: "" }];

  return uploadFiles({ ...params, tasks });
}

export { collectFiles, uploadFiles, uploadFolder, CONCURRENCY, DELAY_BETWEEN_REQUESTS_MS };
export type { FileTask, UploadFilesParams, UploadFolderParams, UploadResult };
