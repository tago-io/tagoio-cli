import { Account } from "@tago-io/sdk";
import axios, { AxiosError } from "axios";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import { BackupErrorResponse, BackupListResponse, ListOptions } from "./types";

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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

async function listBackups(options: ListOptions) {
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
  const userBaseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : defaultBaseURL;

  const queryParams = new URLSearchParams();
  if (options.page) {
    queryParams.append("page", options.page.toString());
  }
  if (options.amount) {
    queryParams.append("amount", options.amount.toString());
  }

  const orderByField = options.orderBy || "created_at";
  const orderDirection = options.order || "desc";
  queryParams.append("orderBy", `${orderByField},${orderDirection}`);

  const queryString = queryParams.toString();
  const url = `${userBaseURL}/profile/${profileID}/backup?${queryString}`;
  const headers = { Authorization: config.profileToken };

  try {
    const response = await axios.get<BackupListResponse>(url, { headers });
    const backups = response.data.result;

    if (!backups || backups.length === 0) {
      infoMSG("No backups found for this profile.");
      return;
    }

    const tableData = backups.map((backup) => ({
      "Backup ID": backup.id,
      Status: backup.status,
      "Created At": formatDate(backup.created_at),
      Size: formatFileSize(backup.file_size),
      ...(backup.error_message ? { Error: backup.error_message } : {}),
    }));

    console.table(tableData);
    successMSG(`${highlightMSG(backups.length)} backup(s) found.`);
  } catch (error) {
    const axiosError = error as AxiosError<BackupErrorResponse>;

    if (axiosError.response?.status === 403) {
      errorHandler("Backup feature is not available on the Free plan. Please upgrade your plan to use this feature.");
      return;
    }

    if (axiosError.response?.data?.message) {
      errorHandler(axiosError.response.data.message);
      return;
    }

    errorHandler(`Failed to list backups: ${axiosError.message}`);
  }
}

export { listBackups };
