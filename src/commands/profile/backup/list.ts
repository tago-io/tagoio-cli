import { Account } from "@tago-io/sdk";
import axios from "axios";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import { formatDate, formatFileSize, handleBackupError } from "./lib";
import { BackupListResponse, ListOptions } from "./types";

/** Builds query parameters for backup list API. */
function buildQueryParams(options: ListOptions): string {
  const params = new URLSearchParams();

  if (options.page) {
    params.append("page", options.page.toString());
  }
  if (options.amount) {
    params.append("amount", options.amount.toString());
  }

  const orderBy = options.orderBy || "created_at";
  const order = options.order || "desc";
  params.append("orderBy", `${orderBy},${order}`);

  return params.toString();
}

/** Lists all profile backups with pagination and sorting options. */
async function listBackups(options: ListOptions) {
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

  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : "https://api.tago.io";
  const url = `${baseURL}/profile/${profile.info.id}/backup?${buildQueryParams(options)}`;

  try {
    const response = await axios.get<BackupListResponse>(url, { headers: { Authorization: config.profileToken } });
    const backups = response.data.result;

    if (!backups?.length) {
      infoMSG("No backups found for this profile.");
      return;
    }

    const tableData = backups.map((backup) => ({
      "Backup ID": backup.id,
      Status: backup.status,
      "Created At": formatDate(backup.created_at),
      Size: formatFileSize(backup.file_size),
      ...(backup.error_message && { Error: backup.error_message }),
    }));

    console.table(tableData);
    successMSG(`${highlightMSG(backups.length)} backup(s) found.`);
  } catch (error) {
    handleBackupError(error, "Failed to list backups");
  }
}

export { listBackups };
