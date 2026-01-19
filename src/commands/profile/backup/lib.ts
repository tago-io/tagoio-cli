import { readFileSync } from "node:fs";
import { join } from "node:path";

import { errorHandler } from "../../../lib/messages";

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

export { formatDate, formatFileSize, getErrorMessage, handleBackupError, readBackupFile, readBackupSingleFile };
