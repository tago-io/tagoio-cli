import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import { Account } from "@tago-io/sdk";
import axios from "axios";
import kleur from "kleur";
import prompts from "prompts";
import unzipper from "unzipper";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import { confirmPrompt } from "../../../prompt/confirm";
import { pickFromList } from "../../../prompt/pick-from-list";
import { formatDate, formatFileSize, handleBackupError } from "./lib";
import {
  BackupDownloadRequest,
  BackupDownloadResponse,
  BackupItem,
  BackupListResponse,
  OtpType,
} from "./types";

async function fetchBackups(profileID: string, baseURL: string, token: string): Promise<BackupItem[]> {
  const queryParams = new URLSearchParams();
  queryParams.append("orderBy", "created_at,desc");

  const url = `${baseURL}/profile/${profileID}/backup?${queryParams.toString()}`;
  const headers = { Authorization: token };

  const response = await axios.get<BackupListResponse>(url, { headers });
  return response.data.result || [];
}

async function getDownloadUrl(
  profileID: string,
  backupID: string,
  baseURL: string,
  token: string,
  credentials: BackupDownloadRequest
): Promise<string> {
  const url = `${baseURL}/profile/${profileID}/backup/${backupID}/download`;
  const headers = { Authorization: token };

  const response = await axios.post<BackupDownloadResponse>(url, credentials, { headers });
  const { result } = response.data;

  infoMSG(`Backup size: ${highlightMSG(result.file_size_mb + " MB")}`);
  infoMSG(`Download expires at: ${highlightMSG(formatDate(result.expire_at))}`);

  return result.url;
}

async function downloadAndExtractBackup(downloadUrl: string, backupID: string): Promise<string> {
  const tempDir = join(tmpdir(), `tagoio-backup-${backupID}-${Date.now()}`);
  const zipPath = join(tempDir, "backup.zip");
  const extractDir = join(tempDir, "extracted");

  mkdirSync(tempDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });

  infoMSG("Downloading backup file...");

  const response = await axios.get(downloadUrl, { responseType: "stream" });
  const writer = createWriteStream(zipPath);

  await pipeline(response.data, writer);

  successMSG("Backup downloaded successfully.");
  infoMSG("Extracting backup contents...");

  const readStream = createReadStream(zipPath);
  await readStream.pipe(unzipper.Extract({ path: extractDir })).promise();

  successMSG("Backup extracted successfully.");
  infoMSG(`Backup contents available at: ${highlightMSG(extractDir)}`);

  return extractDir;
}

async function restoreBackup() {
  const config = getEnvironmentConfig();
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });

  const profile = await account.profiles.info("current").catch(errorHandler);
  if (!profile) {
    return;
  }

  const profileID = profile.info.id;

  const defaultBaseURL = "https://api.tago.io";
  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : defaultBaseURL;

  infoMSG("Fetching available backups...\n");

  try {
    const backups = await fetchBackups(profileID, baseURL, config.profileToken);

    const completedBackups = backups.filter((backup) => backup.status === "completed");

    if (completedBackups.length === 0) {
      errorHandler("No completed backups available for restoration. Only backups with status 'completed' can be restored.");
      return;
    }

    const backupChoices = completedBackups.map((backup) => ({
      title: `${formatDate(backup.created_at)} - ${formatFileSize(backup.file_size)} (${backup.id})`,
      value: backup.id,
    }));

    const selectedBackupId = await pickFromList(backupChoices, {
      message: "Select a backup to restore",
    });

    if (!selectedBackupId) {
      errorHandler("No backup selected");
      return;
    }

    const selectedBackup = completedBackups.find((backup) => backup.id === selectedBackupId);
    if (!selectedBackup) {
      errorHandler("Selected backup not found");
      return;
    }

    successMSG(`Selected backup: ${highlightMSG(selectedBackupId)}`);
    infoMSG(`Created at: ${formatDate(selectedBackup.created_at)}`);
    infoMSG(`Size: ${formatFileSize(selectedBackup.file_size)}`);

    console.info("");
    console.info(kleur.bgYellow().black().bold(" WARNING "));
    console.info(kleur.yellow("═".repeat(60)));
    console.info(kleur.yellow().bold("IDs are NOT restored. New IDs will be generated for all resources."));
    console.info(kleur.yellow("This means any external references to resource IDs will need to be updated."));
    console.info(kleur.yellow("═".repeat(60)));
    console.info("");

    const confirmed = await confirmPrompt("Do you want to proceed with the restoration?");
    if (!confirmed) {
      infoMSG("Restoration cancelled by user.");
      return;
    }

    console.info("");
    infoMSG("Authentication required to download the backup.\n");

    const { password } = await prompts({
      type: "password",
      name: "password",
      message: "Enter your account password:",
    });

    if (!password) {
      errorHandler("Password is required to download the backup.");
      return;
    }

    const otpTypeChoices = [
      { title: "None (2FA not enabled)", value: "none" },
      { title: "Authenticator App", value: "authenticator" },
      { title: "SMS", value: "sms" },
      { title: "Email", value: "email" },
    ];

    const otpType = await pickFromList(otpTypeChoices, {
      message: "Select your 2FA method",
    });

    if (!otpType) {
      errorHandler("2FA method selection is required.");
      return;
    }

    let pinCode: string | undefined;

    if (otpType !== "none") {
      const { pin } = await prompts({
        type: "text",
        name: "pin",
        message: "Enter your OTP code:",
      });

      if (!pin) {
        errorHandler("OTP code is required for the selected 2FA method.");
        return;
      }

      pinCode = pin;
    }

    successMSG("Credentials received.");
    console.info("");

    const downloadCredentials: BackupDownloadRequest = {
      password,
      ...(otpType !== "none" && { otp_type: otpType as OtpType }),
      ...(pinCode && { pin_code: pinCode }),
    };

    infoMSG("Requesting backup download URL...");

    const downloadUrl = await getDownloadUrl(profileID, selectedBackupId, baseURL, config.profileToken, downloadCredentials);

    successMSG("Download URL obtained.");
    console.info("");

    const extractDir = await downloadAndExtractBackup(downloadUrl, selectedBackupId);

    console.info("");
    infoMSG(`Backup extracted to: ${highlightMSG(extractDir)}`);

    // TODO: Next steps will be implemented in subsequent tasks:
    // - Analyze backup contents and count resources
    // - Display summary table
    // - Confirm restoration
    // - Execute restoration scripts
  } catch (error) {
    handleBackupError(error, "Failed to restore backup");
  }
}

export { restoreBackup };
