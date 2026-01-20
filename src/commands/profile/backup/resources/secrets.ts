import { Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface BackupSecret {
  id: string;
  key: string;
  profile: string;
  tags: Array<{ key: string; value: string }>;
  created_at: string;
  updated_at: string;
  value: string;
}

interface RestoreTask {
  secret: BackupSecret;
  exists: boolean;
}

const CONCURRENCY = 1;
const DELAY_BETWEEN_REQUESTS_MS = 600;

/** Fetches all existing secret IDs from the profile. */
async function fetchExistingSecretIds(resources: Resources): Promise<Set<string>> {
  const secrets = await resources.secrets.list({ amount: 10000, fields: ["id", "key"] });
  return new Set(secrets.map((s) => s.key));
}

/** Processes a single secret restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { secret, exists } = task;

  try {
    if (exists) {
      result.updated++;
      spinner.text = `Restoring secrets... (${result.created} created, ${result.updated} skipped)`;
    } else {
      await resources.secrets.create({
        key: secret.key,
        value: secret.value,
        tags: secret.tags,
      });
      result.created++;
      spinner.text = `Restoring secrets... (${result.created} created, ${result.updated} skipped)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to restore secret "${secret.key}": ${getErrorMessage(error)}`);
  }
}

/** Restores secrets from backup. */
async function restoreSecrets(resources: Resources, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading secrets data from backup...");
  const backupSecrets = readBackupFile<BackupSecret>(extractDir, "secrets.json");

  if (backupSecrets.length === 0) {
    infoMSG("No secrets found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupSecrets.length.toString())} secrets in backup.`);

  infoMSG("Fetching existing secrets from profile...");
  const existingKeys = await fetchExistingSecretIds(resources);
  infoMSG(`Found ${highlightMSG(existingKeys.size.toString())} existing secrets in profile.`);

  console.info("");
  const spinner = ora("Restoring secrets...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const secret of backupSecrets) {
    const exists = existingKeys.has(secret.key);
    void restoreQueue.push({ secret, exists });
  }

  if (backupSecrets.length > 0) {
    await restoreQueue.drain();
  }

  spinner.succeed(`Secrets restored: ${result.created} created, ${result.updated} skipped, ${result.failed} failed`);

  return result;
}

export { restoreSecrets };
