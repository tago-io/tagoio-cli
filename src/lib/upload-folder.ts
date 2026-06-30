import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import type { Resources } from "@tago-io/sdk";
import { queue } from "async";

import { writeStatus } from "./messages.js";

interface FileTask {
  filePath: string;
  relativePath: string;
}

// Content types by extension. uploadBase64 cannot set a Content-Type, so files
// land in storage as application/octet-stream and browsers download them instead
// of rendering — which breaks custom-widget index.html in the dashboard iframe.
// uploadFile lets us set the type explicitly.
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain",
};

/** Resolves the Content-Type for a file by extension, defaulting to octet-stream. */
function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
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

/** Uploads a single file under the remote prefix with an explicit Content-Type. */
async function uploadOne(params: UploadFilesParams, task: FileTask, result: UploadResult) {
  const content = readFileSync(task.filePath);
  const filename = `/${join(params.remotePath, task.relativePath)}`;

  // uploadFile (multipart) is used over uploadBase64 because only it accepts a
  // contentType; without it browsers download files instead of rendering them.
  await params.resources.files
    .uploadFile(content, filename, { isPublic: params.public, contentType: contentTypeFor(task.filePath) })
    .then(() => {
      result.created++;
    })
    .catch((error) => {
      result.failed++;
      writeStatus(`Failed to upload file "${filename}": ${error?.message ?? error}`);
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
