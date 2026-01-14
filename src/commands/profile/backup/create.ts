import { Account } from "@tago-io/sdk";
import axios, { AxiosError } from "axios";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";

interface BackupCreateResponse {
  status: boolean;
  result: string;
}

interface BackupErrorResponse {
  status: boolean;
  message: string;
}

async function createBackup() {
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
  const profileName = profile.info.name;

  infoMSG(`Creating backup for profile: ${highlightMSG(profileName)} (${profileID})`);

  const defaultBaseURL = "https://api.tago.io";
  const userBaseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : defaultBaseURL;
  const url = `${userBaseURL}/profile/${profileID}/backup`;
  const headers = { Authorization: config.profileToken };

  try {
    const response = await axios.post<BackupCreateResponse>(url, {}, { headers });

    successMSG(`Backup creation initiated successfully!`);
    infoMSG(`Response: ${highlightMSG(response.data.result)}`);
    console.info(`\n${kleur.yellow("Note:")} The backup process is ${kleur.bold("asynchronous")} and may take several minutes to complete.`);
    console.info(`You can use ${kleur.cyan("tagoio backup list")} to check the status of your backups.`);
  } catch (error) {
    const axiosError = error as AxiosError<BackupErrorResponse>;

    if (axiosError.response?.status === 403) {
      const message = axiosError.response.data?.message || "Access forbidden";

      if (message.toLowerCase().includes("free") || message.toLowerCase().includes("plan")) {
        errorHandler("Backup feature is not available on the Free plan. Please upgrade your plan to use this feature.");
      } else if (message.toLowerCase().includes("rate") || message.toLowerCase().includes("limit") || message.toLowerCase().includes("day")) {
        errorHandler("Backup rate limit exceeded. You can only create one backup per day. Please try again tomorrow.");
      } else {
        errorHandler(`Access forbidden: ${message}`);
      }
      return;
    }

    if (axiosError.response?.data?.message) {
      errorHandler(axiosError.response.data.message);
      return;
    }

    errorHandler(`Failed to create backup: ${axiosError.message}`);
  }
}

export { createBackup };
