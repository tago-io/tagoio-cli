import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import { Resources } from "@tago-io/sdk";
import axios from "axios";
import ora from "ora";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import {
  fetchBackups,
  formatDate,
  formatFileSize,
  getDownloadUrl,
  handleBackupError,
  promptCredentials,
  selectBackup,
} from "./lib";

const DOWNLOAD_FOLDER = "profile-backup-download";

/** Downloads backup to the specified directory. */
async function downloadBackupToFolder(downloadUrl: string, outputDir: string, backupId: string): Promise<string> {
  mkdirSync(outputDir, { recursive: true });

  const fileName = `backup-${backupId}.zip`;
  const filePath = join(outputDir, fileName);

  const spinner = ora("Downloading backup file...").start();
  const response = await axios.get(downloadUrl, { responseType: "stream" });
  await pipeline(response.data, createWriteStream(filePath));
  spinner.succeed(`Backup downloaded to: ${filePath}`);

  return filePath;
}

/** Interactive download flow for profile backups. */
async function downloadBackup() {
  const config = getEnvironmentConfig();
  if (!config?.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const profile = await resources.profiles.info("current").catch(errorHandler);
  if (!profile) {
    return;
  }

  const profileID = profile.info.id;
  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : "https://api.tago.io";

  infoMSG("Fetching available backups...\n");

  try {
    const backups = await fetchBackups(profileID, baseURL, config.profileToken);
    const selectedBackup = await selectBackup(backups, "download");
    if (!selectedBackup) {
      return;
    }

    successMSG(`Selected backup: ${highlightMSG(selectedBackup.id)}`);
    infoMSG(`Created at: ${formatDate(selectedBackup.created_at)}`);
    infoMSG(`Size: ${formatFileSize(selectedBackup.file_size)}`);

    console.info("");
    infoMSG("Authentication required to download the backup.\n");

    const credentials = await promptCredentials();
    if (!credentials) {
      return;
    }

    successMSG("Credentials received.");
    console.info("");

    infoMSG("Requesting backup download URL...");
    const downloadResult = await getDownloadUrl(profileID, selectedBackup.id, baseURL, config.profileToken, credentials);
    infoMSG(`Backup size: ${highlightMSG(downloadResult.fileSizeMb + " MB")}`);
    infoMSG(`Download expires at: ${highlightMSG(formatDate(downloadResult.expireAt))}`);
    successMSG("Download URL obtained.");
    console.info("");

    const outputDir = join(process.cwd(), DOWNLOAD_FOLDER);
    await downloadBackupToFolder(downloadResult.url, outputDir, selectedBackup.id);

    console.info("");
    successMSG("Backup download completed!");
  } catch (error) {
    handleBackupError(error, "Failed to download backup");
  }
}

export { downloadBackup };
