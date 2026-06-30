import { Account } from "@tago-io/sdk";
import kleur from "kleur";
import ora, { type Ora } from "ora";

import { getEnvironmentConfig } from "../../../lib/config-file.js";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages.js";
import { resolveScope } from "../../../lib/resolve-scope.js";
import { printScopeBanner } from "../../../lib/scope-notice.js";
import { handleBackupError } from "./lib.js";
import { BackupItem, BackupListResponse } from "./types.js";

const POLL_INTERVAL_MS = 10000;

/** Fetches the most recent backup for the profile. */
async function fetchLatestBackup(profileID: string, baseURL: string, token: string): Promise<BackupItem | null> {
  const url = `${baseURL}/profile/${profileID}/backup?orderBy=created_at,desc&amount=1`;
  const response = await fetch(url, { headers: { Authorization: token } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const body = (await response.json()) as BackupListResponse;
  return body.result?.[0] || null;
}

/** Polls backup status until completed or failed. */
async function waitForBackupCompletion(profileID: string, baseURL: string, token: string, spinner: Ora): Promise<BackupItem | null> {
  let elapsedSeconds = 0;

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    elapsedSeconds += POLL_INTERVAL_MS / 1000;

    const backup = await fetchLatestBackup(profileID, baseURL, token);
    if (!backup) {
      continue;
    }

    spinner.text = `Creating backup... (${elapsedSeconds}s)`;

    if (backup.status === "completed") {
      return backup;
    }

    if (backup.status === "failed") {
      spinner.fail(`Backup failed: ${backup.error_message || "Unknown error"}`);
      return null;
    }
  }
}

/** Triggers a new profile backup and waits for completion. */
async function createBackup() {
  printScopeBanner(resolveScope());

  const config = getEnvironmentConfig();
  if (!config?.profileToken) {
    errorHandler("Environment not found");
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  const profile = await account.profiles.info("current").catch(errorHandler);
  if (!profile) {
    return;
  }

  const profileID = profile.info.id;
  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : "https://api.tago.io";
  const url = `${baseURL}/profile/${profileID}/backup`;

  infoMSG(`Creating backup for profile: ${highlightMSG(profile.info.name)} (${profileID})`);

  try {
    const postResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: config.profileToken,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!postResponse.ok) {
      throw new Error(`Request failed: ${postResponse.status}`);
    }

    process.stderr.write("\n");
    process.stderr.write(`${kleur.gray("Press Ctrl+C or Cmd+C to stop waiting. The backup will continue in the background.")}\n`);
    process.stderr.write("\n");

    const spinner = ora("Creating backup...").start();

    const completedBackup = await waitForBackupCompletion(profileID, baseURL, config.profileToken, spinner);

    if (completedBackup) {
      spinner.succeed("Backup completed successfully!");
      process.stderr.write("\n");
      successMSG(`Backup ID: ${highlightMSG(completedBackup.id)}`);
    }
  } catch (error) {
    handleBackupError(error, "Failed to create backup");
  }
}

export { createBackup };
