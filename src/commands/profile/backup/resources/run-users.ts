import { Resources, UserInfo } from "@tago-io/sdk";
import { queue } from "async";
import { randomBytes } from "node:crypto";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupFile, selectItemsFromBackup } from "../lib";
import { RestoreResult } from "../types";

interface BackupRunUser extends UserInfo {
  password?: string | null;
  otp?: unknown;
  custom_preferences?: unknown;
  agreements?: unknown;
}

interface RestoreTask {
  user: BackupRunUser;
  existsId: string | undefined;
}

const CONCURRENCY = 10;
const DELAY_BETWEEN_REQUESTS_MS = 100;

/** Generates a random password for new users. */
function generateRandomPassword(): string {
  return randomBytes(16).toString("hex");
}

/** Fetches existing run users mapped by email to ID. */
async function fetchExistingUsersByEmail(resources: Resources): Promise<Map<string, string>> {
  const users = await resources.run.listUsers({ amount: 10000, fields: ["id", "email"] });
  return new Map(users.map((u) => [u.email, u.id]));
}

/** Processes a single run user restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { user, existsId } = task;

  try {
    if (existsId) {
      const {
        id: _id,
        password: _password,
        created_at: _created_at,
        updated_at: _updated_at,
        ...editData
      } = user;

      await resources.run.userEdit(existsId, editData);
      result.updated++;
      spinner.text = `Restoring run users... (${result.created} created, ${result.updated} updated)`;
    } else {
      const createData = {
        name: user.name,
        email: user.email,
        password: generateRandomPassword(),
        timezone: user.timezone,
        company: user.company,
        phone: user.phone,
        language: user.language,
        tags: user.tags,
        active: user.active,
        options: user.options,
      };

      await resources.run.userCreate(createData);
      result.created++;
      spinner.text = `Restoring run users... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to restore run user "${user.name}": ${getErrorMessage(error)}`);
  }
}

/** Restores run users from backup. */
async function restoreRunUsers(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading run users data from backup...");
  let backupUsers = readBackupFile<BackupRunUser>(extractDir, "run_users.json");

  if (backupUsers.length === 0) {
    infoMSG("No run users found in backup.");
    return result;
  }

  if (granularItem) {
    const itemsWithName = backupUsers.map((u) => ({ ...u, id: u.id, name: u.email }));
    const selected = await selectItemsFromBackup(itemsWithName, "run users");
    if (!selected || selected.length === 0) {
      infoMSG("No run users selected. Skipping.");
      return result;
    }
    backupUsers = selected as BackupRunUser[];
  }

  infoMSG(`Restoring ${highlightMSG(backupUsers.length.toString())} run users...`);

  infoMSG("Fetching existing run users from profile...");
  const existingEmails = await fetchExistingUsersByEmail(resources);
  infoMSG(`Found ${highlightMSG(existingEmails.size.toString())} existing run users in profile.`);

  console.info("");
  const spinner = ora("Restoring run users...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const user of backupUsers) {
    const existsId = existingEmails.get(user.email);
    void restoreQueue.push({ user, existsId });
  }

  if (backupUsers.length > 0) {
    await restoreQueue.drain();
  }

  spinner.succeed(`Run users restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreRunUsers };
