import type { Resources } from "@tago-io/sdk";
import { queue } from "async";

import { writeStatus } from "./messages.js";
import { CONCURRENCY, DELAY_BETWEEN_REQUESTS_MS } from "./upload-folder.js";

/**
 * Path helpers shared by the folder-capable files-* commands. The SDK operates
 * per file, so "folder" operations list a prefix recursively and act on each
 * file; these helpers centralize the prefix detection, listing, and remapping.
 */

/**
 * Returns true when `path` should be treated as a folder prefix rather than a
 * single file: it ends with `/`, or its last segment has no file extension.
 */
function isFolderPath(path: string): boolean {
  if (path.endsWith("/")) {
    return true;
  }
  const lastSegment = path.split("/").pop() ?? "";
  return !lastSegment.includes(".");
}

/**
 * Rewrites `filePath`'s `from` prefix to `to`, preserving the relative path and
 * the file's leading slash. Files not under `from` are returned unchanged.
 */
function remapPrefix(filePath: string, from: string, to: string): string {
  const normalizedFile = filePath.replace(/^\/+/, "");
  const normalizedFrom = from.replace(/^\/+|\/+$/g, "");

  if (normalizedFile !== normalizedFrom && !normalizedFile.startsWith(`${normalizedFrom}/`)) {
    return filePath;
  }

  const relative = normalizedFile.slice(normalizedFrom.length).replace(/^\/+/, "");
  const normalizedTo = to.replace(/^\/+|\/+$/g, "");
  const leadingSlash = filePath.startsWith("/") ? "/" : "";
  return relative ? `${leadingSlash}${normalizedTo}/${relative}` : `${leadingSlash}${normalizedTo}`;
}

/**
 * Lists every file under `prefix`, walking nested folders into a flat array of
 * filenames.
 */
async function listFilesRecursive(resources: Resources, prefix: string): Promise<string[]> {
  // The API only returns a folder's contents when the path ends with a slash;
  // without it the folder comes back as a sibling and the listing is empty.
  const normalizedPrefix = `${prefix.replace(/\/+$/, "")}/`;

  const { files, folders } = await resources.files.list({ path: normalizedPrefix });
  const here = files.map((f) => f.filename);

  // `folders` are relative names, so join each with the prefix before recursing.
  const nested = await Promise.all(folders.map((folder) => listFilesRecursive(resources, `${normalizedPrefix}${folder}`)));

  return [...here, ...nested.flat()];
}

interface BatchResult {
  succeeded: number;
  failed: number;
}

/**
 * Runs `operation` over every file through a throttled queue, counting per-file
 * success and failure instead of letting a single rejection slip past `drain()`.
 * Each failure is logged with its reason so a half-failed folder operation is
 * visible and actionable rather than silently reported as fully done.
 */
async function runFileBatch(files: string[], operation: (file: string) => Promise<unknown>): Promise<BatchResult> {
  const result: BatchResult = { succeeded: 0, failed: 0 };

  const fileQueue = queue<string>(async (file) => {
    await operation(file)
      .then(() => {
        result.succeeded++;
      })
      .catch((error) => {
        result.failed++;
        writeStatus(`Failed on "${file}": ${error?.message ?? error}`);
      });
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }, CONCURRENCY);

  for (const file of files) {
    void fileQueue.push(file);
  }
  await fileQueue.drain();

  return result;
}

export { isFolderPath, listFilesRecursive, remapPrefix, runFileBatch };
export type { BatchResult };
