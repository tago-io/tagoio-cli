import { readFileSync } from "node:fs";
import { join } from "node:path";

import axios from "axios";
import prompts from "prompts";

import { errorHandler, highlightMSG, infoMSG } from "../../../lib/messages";
import { pickFromList } from "../../../prompt/pick-from-list";

/** Interface for backup items with id and name for selection. */
interface BackupSelectableItem {
  id: string;
  name: string;
}
import { BackupDownloadRequest, BackupDownloadResponse, BackupItem, BackupListResponse, OtpType } from "./types";

/** Extracts error message from various error types including SDK error objects. */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}

/** Reads and parses a JSON file from the backup resources folder. */
function readJsonFile(extractDir: string, filename: string): unknown {
  const filePath = join(extractDir, "resources", filename);
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/** Reads and parses a JSON array from the backup resources folder. */
function readBackupFile<T>(extractDir: string, filename: string): T[] {
  try {
    return readJsonFile(extractDir, filename) as T[];
  } catch {
    return [];
  }
}

/** Reads and parses a single JSON object from the backup resources folder. */
function readBackupSingleFile<T>(extractDir: string, filename: string): T | null {
  try {
    return readJsonFile(extractDir, filename) as T;
  } catch {
    return null;
  }
}

/** Formats bytes into human-readable file size string. */
function formatFileSize(bytes?: number): string {
  if (!bytes) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/** Formats ISO date string to localized date and time. */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

/** Handles API errors displaying status code and message to the user. */
function handleBackupError(error: unknown, fallbackMessage: string): void {
  const axiosError = error as { response?: { status?: number; data?: { message?: string } }; message?: string };

  if (axiosError.response?.data?.message) {
    errorHandler(`[${axiosError.response.status}] ${axiosError.response.data.message}`);
    return;
  }

  if (axiosError.message) {
    errorHandler(`${fallbackMessage}: ${axiosError.message}`);
    return;
  }

  errorHandler(fallbackMessage);
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
): Promise<{ url: string; fileSizeMb: string; expireAt: string }> {
  const url = `${baseURL}/profile/${profileID}/backup/${backupID}/download`;
  const response = await axios.post<BackupDownloadResponse>(url, credentials, { headers: { Authorization: token } });
  const { result } = response.data;

  return {
    url: result.url,
    fileSizeMb: result.file_size_mb,
    expireAt: result.expire_at,
  };
}

/** Prompts user for password and optional OTP credentials. */
async function promptCredentials(): Promise<BackupDownloadRequest | null> {
  const { password } = await prompts({ type: "password", name: "password", message: "Enter your resources password:" });
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
async function selectBackup(backups: BackupItem[], action: string): Promise<BackupItem | null> {
  const completedBackups = backups.filter((b) => b.status === "completed");

  if (completedBackups.length === 0) {
    errorHandler(`No completed backups available. Only backups with status 'completed' can be ${action}.`);
    return null;
  }

  const choices = completedBackups.map((b) => ({
    title: `${formatDate(b.created_at)} - ${formatFileSize(b.file_size)} (${b.id})`,
    value: b.id,
  }));

  const selectedId = await pickFromList(choices, { message: `Select a backup to ${action}` });
  if (!selectedId) {
    errorHandler("No backup selected");
    return null;
  }

  return completedBackups.find((b) => b.id === selectedId) || null;
}

/** Prompts user to select specific items from a backup resource with searchable multi-select. */
async function selectItemsFromBackup<T extends BackupSelectableItem>(
  items: T[],
  resourceName: string
): Promise<T[] | null> {
  if (items.length === 0) {
    infoMSG(`No ${resourceName} found in backup.`);
    return [];
  }

  infoMSG(`Found ${highlightMSG(items.length.toString())} ${resourceName} in backup.`);

  const choices = items.map((item) => ({
    title: `${item.name} (${item.id})`,
    value: item.id,
  }));

  const { selected } = await prompts({
    type: "autocompleteMultiselect",
    name: "selected",
    message: `Select ${resourceName} to restore (type to search):`,
    choices,
    instructions: false,
    hint: "- Space to select, Enter to confirm",
  });

  if (!selected || selected.length === 0) {
    return null;
  }

  const selectedIds = new Set(selected as string[]);
  return items.filter((item) => selectedIds.has(item.id));
}

export {
  fetchBackups,
  formatDate,
  formatFileSize,
  getDownloadUrl,
  getErrorMessage,
  handleBackupError,
  promptCredentials,
  readBackupFile,
  readBackupSingleFile,
  selectBackup,
  selectItemsFromBackup,
};
