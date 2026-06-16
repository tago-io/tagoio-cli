import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";

import type { Resources } from "@tago-io/sdk";

import { getApiURL } from "../../lib/config-file.js";
import { isFolderPath, listFilesRecursive, remapPrefix } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveResources } from "../../lib/resolve-resources.js";
import { DELAY_BETWEEN_REQUESTS_MS } from "../../lib/upload-folder.js";

interface DownloadOptions {
  environment?: string;
  token?: string;
}

/** Resolves the URL to fetch for a file, signing it when the file is private. */
async function resolveDownloadURL(resources: Resources, baseURL: string, remotePath: string): Promise<string> {
  const cleanPath = remotePath.replace(/^\/+/, "");
  const publicURL = `${baseURL}/${cleanPath}`;

  const { public: isPublic } = await resources.files.checkPermission(cleanPath);
  return isPublic ? publicURL : resources.files.getFileURLSigned(publicURL);
}

/** Fetches a remote file and writes it to `localDest`, creating parent dirs. */
async function downloadOne(resources: Resources, baseURL: string, remotePath: string, localDest: string): Promise<void> {
  const url = await resolveDownloadURL(resources, baseURL, remotePath);
  const response = await fetch(url);
  if (!response.ok) {
    errorHandler(`Download failed for ${remotePath} (HTTP ${response.status}).`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(localDest), { recursive: true });
  await writeFile(localDest, buffer);
}

/** Joins `relative` under `destRoot`, refusing any path that escapes it. */
function safeJoin(destRoot: string, relative: string): string {
  const target = resolve(destRoot, relative);
  const root = resolve(destRoot);
  if (target !== root && !target.startsWith(root + sep)) {
    errorHandler(`Refusing to write outside ${destRoot}: ${relative}`);
  }
  return target;
}

/** Downloads a file or a folder prefix from TagoIO Files to the local disk. */
async function filesDownloadCommand(remotePath: string, localDest: string | undefined, options: DownloadOptions) {
  const { resources, region } = resolveResources(options);
  const profile = await resources.profiles.info("current");
  const baseURL = `${getApiURL(region)}/file/${profile.info.id}`;

  if (!isFolderPath(remotePath)) {
    const dest = localDest ?? basename(remotePath);
    infoMSG(`Downloading ${remotePath} -> ${dest} ...`);
    await downloadOne(resources, baseURL, remotePath, dest);
    successMSG("Downloaded 1 file.");
    return;
  }

  const files = await listFilesRecursive(resources, remotePath);
  if (files.length === 0) {
    errorHandler(`No files found under '${remotePath}'.`);
  }

  const destRoot = localDest ?? basename(remotePath.replace(/\/+$/, ""));
  infoMSG(`Downloading ${files.length} file(s) from '${remotePath}' -> ${destRoot}/ ...`);

  for (const filePath of files) {
    const relative = remapPrefix(filePath, remotePath, "").replace(/^\/+/, "");
    await downloadOne(resources, baseURL, filePath, safeJoin(destRoot, relative));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, DELAY_BETWEEN_REQUESTS_MS));
  }

  successMSG(`Downloaded ${files.length} file(s).`);
}

export { filesDownloadCommand };
