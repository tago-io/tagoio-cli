import { Account } from "@tago-io/sdk";
import axios from "axios";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import { handleBackupError } from "./lib";
import { BackupCreateResponse } from "./types";

/** Triggers a new profile backup creation via TagoIO API. */
async function createBackup() {
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
  infoMSG(`Creating backup for profile: ${highlightMSG(profile.info.name)} (${profileID})`);

  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : "https://api.tago.io";
  const url = `${baseURL}/profile/${profileID}/backup`;

  try {
    const response = await axios.post<BackupCreateResponse>(url, {}, { headers: { Authorization: config.profileToken } });

    successMSG("Backup creation initiated successfully!");
    infoMSG(`Response: ${highlightMSG(response.data.result)}`);
    console.info(`\n${kleur.yellow("Note:")} The backup process is ${kleur.bold("asynchronous")} and may take several minutes.`);
    console.info(`Use ${kleur.cyan("tagoio backup list")} to check the status of your backups.`);
  } catch (error) {
    handleBackupError(error, "Failed to create backup");
  }
}

export { createBackup };
