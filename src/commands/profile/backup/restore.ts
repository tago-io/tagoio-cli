import { createReadStream, createWriteStream, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";

import { Account } from "@tago-io/sdk";
import axios from "axios";
import kleur from "kleur";
import prompts from "prompts";
import unzipper from "unzipper";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { displayWarning } from "../../../lib/display-warning";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import { confirmPrompt } from "../../../prompt/confirm";
import { pickFromList } from "../../../prompt/pick-from-list";
import { formatDate, formatFileSize, handleBackupError } from "./lib";
import { BackupDownloadRequest, BackupDownloadResponse, BackupItem, BackupListResponse, OtpType } from "./types";

interface BackupSummary {
  resource: string;
  count: number;
}

/** Warning messages for restore operation. */
const RESTORE_WARNING_MESSAGES = [
  { text: "IDs are NOT restored. New IDs will be generated for all resources.", bold: true },
  { text: "This means any external references to resource IDs will need to be updated.", bold: false },
];

/** Counts all files in a directory recursively. */
function countFilesInDirectory(dirPath: string): number {
  let count = 0;

  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);

    if (stat.isFile()) {
      count++;
    } else if (stat.isDirectory()) {
      count += countFilesInDirectory(entryPath);
    }
  }

  return count;
}

/** Parses a JSON file and returns the resource count. */
function parseJsonResource(filePath: string): number | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    return Array.isArray(data) ? data.length : 1;
  } catch {
    return null;
  }
}

/** Analyzes backup contents and returns resource counts. */
function analyzeBackupContents(extractDir: string): BackupSummary[] {
  const summary: BackupSummary[] = [];

  for (const entry of readdirSync(extractDir)) {
    const entryPath = join(extractDir, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      if (entry === "files") {
        const fileCount = countFilesInDirectory(entryPath);
        if (fileCount > 0) {
          summary.push({ resource: "files", count: fileCount });
        }
      } else {
        for (const subEntry of readdirSync(entryPath).filter((f) => f.endsWith(".json"))) {
          const count = parseJsonResource(join(entryPath, subEntry));
          if (count !== null) {
            summary.push({ resource: basename(subEntry, ".json"), count });
          }
        }
      }
    } else if (entry.endsWith(".json")) {
      const count = parseJsonResource(entryPath);
      if (count !== null) {
        summary.push({ resource: basename(entry, ".json"), count });
      }
    }
  }

  return summary.sort((a, b) => a.resource.localeCompare(b.resource));
}

/** Displays backup summary table with total resource count. */
function displayBackupSummary(summary: BackupSummary[]): void {
  console.info("");
  console.info(kleur.bold("Backup Contents:"));
  console.info(kleur.gray("─".repeat(40)));

  console.table(summary.map((item) => ({ Resource: item.resource, Count: item.count })));

  const totalResources = summary.reduce((acc, item) => acc + item.count, 0);
  infoMSG(`Total resources to restore: ${highlightMSG(totalResources.toString())}`);
}

/** Fetches available backups for a profile. */
async function fetchBackups(profileID: string, baseURL: string, token: string): Promise<BackupItem[]> {
  const url = `${baseURL}/profile/${profileID}/backup?orderBy=created_at,desc`;
  const response = await axios.get<BackupListResponse>(url, { headers: { Authorization: token } });
  return response.data.result || [];
}

/** Requests download URL for a backup with authentication. */
async function getDownloadUrl(
  profileID: string,
  backupID: string,
  baseURL: string,
  token: string,
  credentials: BackupDownloadRequest
): Promise<string> {
  const url = `${baseURL}/profile/${profileID}/backup/${backupID}/download`;
  const response = await axios.post<BackupDownloadResponse>(url, credentials, { headers: { Authorization: token } });
  const { result } = response.data;

  infoMSG(`Backup size: ${highlightMSG(result.file_size_mb + " MB")}`);
  infoMSG(`Download expires at: ${highlightMSG(formatDate(result.expire_at))}`);

  return result.url;
}

/** Downloads and extracts backup to a temporary directory. */
async function downloadAndExtractBackup(downloadUrl: string, backupID: string): Promise<string> {
  const tempDir = join(tmpdir(), `tagoio-backup-${backupID}-${Date.now()}`);
  const zipPath = join(tempDir, "backup.zip");
  const extractDir = join(tempDir, "extracted");

  mkdirSync(tempDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });

  infoMSG("Downloading backup file...");
  const response = await axios.get(downloadUrl, { responseType: "stream" });
  await pipeline(response.data, createWriteStream(zipPath));
  successMSG("Backup downloaded successfully.");

  infoMSG("Extracting backup contents...");
  await createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
  successMSG("Backup extracted successfully.");

  return extractDir;
}

/** Prompts user for password and optional OTP credentials. */
async function promptCredentials(): Promise<BackupDownloadRequest | null> {
  const { password } = await prompts({ type: "password", name: "password", message: "Enter your account password:" });
  if (!password) {
    errorHandler("Password is required to download the backup.");
    return null;
  }

  const otpTypeChoices = [
    { title: "None (2FA not enabled)", value: "none" },
    { title: "Authenticator App", value: "authenticator" },
    { title: "SMS", value: "sms" },
    { title: "Email", value: "email" },
  ];

  const otpType = await pickFromList(otpTypeChoices, { message: "Select your 2FA method" });
  if (!otpType) {
    errorHandler("2FA method selection is required.");
    return null;
  }

  let pinCode: string | undefined;
  if (otpType !== "none") {
    const { pin } = await prompts({ type: "text", name: "pin", message: "Enter your OTP code:" });
    if (!pin) {
      errorHandler("OTP code is required for the selected 2FA method.");
      return null;
    }
    pinCode = pin;
  }

  return {
    password,
    ...(otpType !== "none" && { otp_type: otpType as OtpType }),
    ...(pinCode && { pin_code: pinCode }),
  };
}

/** Selects a completed backup from the list. */
async function selectBackup(backups: BackupItem[]): Promise<BackupItem | null> {
  const completedBackups = backups.filter((b) => b.status === "completed");

  if (completedBackups.length === 0) {
    errorHandler("No completed backups available. Only backups with status 'completed' can be restored.");
    return null;
  }

  const choices = completedBackups.map((b) => ({
    title: `${formatDate(b.created_at)} - ${formatFileSize(b.file_size)} (${b.id})`,
    value: b.id,
  }));

  const selectedId = await pickFromList(choices, { message: "Select a backup to restore" });
  if (!selectedId) {
    errorHandler("No backup selected");
    return null;
  }

  return completedBackups.find((b) => b.id === selectedId) || null;
}

/** Interactive restore flow for profile backups. */
async function restoreBackup() {
  const config = getEnvironmentConfig();
  if (!config?.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  const profile = await account.profiles.info("current").catch(errorHandler);
  if (!profile) {
    return;
  }

  const profileID = profile.info.id;
  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : "https://api.tago.io";

  infoMSG("Fetching available backups...\n");

  try {
    const backups = await fetchBackups(profileID, baseURL, config.profileToken);
    const selectedBackup = await selectBackup(backups);
    if (!selectedBackup) {
      return;
    }

    successMSG(`Selected backup: ${highlightMSG(selectedBackup.id)}`);
    infoMSG(`Created at: ${formatDate(selectedBackup.created_at)}`);
    infoMSG(`Size: ${formatFileSize(selectedBackup.file_size)}`);

    displayWarning(RESTORE_WARNING_MESSAGES);

    if (!(await confirmPrompt("Do you want to proceed with the restoration?"))) {
      infoMSG("Restoration cancelled by user.");
      return;
    }

    console.info("");
    infoMSG("Authentication required to download the backup.\n");

    const credentials = await promptCredentials();
    if (!credentials) {
      return;
    }

    successMSG("Credentials received.");
    console.info("");

    infoMSG("Requesting backup download URL...");
    const downloadUrl = await getDownloadUrl(profileID, selectedBackup.id, baseURL, config.profileToken, credentials);
    successMSG("Download URL obtained.");
    console.info("");

    const extractDir = await downloadAndExtractBackup(downloadUrl, selectedBackup.id);
    console.info("");

    const summary = analyzeBackupContents(extractDir);
    if (summary.length === 0) {
      errorHandler("No valid resources found in the backup.");
      return;
    }

    displayBackupSummary(summary);
    console.info("");

    if (!(await confirmPrompt("Do you want to restore these resources to your profile?"))) {
      infoMSG("Restoration cancelled by user.");
      return;
    }

    console.info("");
    infoMSG(`Backup ready at: ${highlightMSG(extractDir)}`);

    // TODO: Execute restoration scripts
  } catch (error) {
    handleBackupError(error, "Failed to restore backup");
  }
}

export { restoreBackup };
