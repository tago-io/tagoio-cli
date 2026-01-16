import { Account } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface BackupAction {
  id: string;
  name: string;
  active?: boolean;
  type?: string;
  trigger?: unknown[];
  action: unknown;
  tags?: Array<{ key: string; value: string }>;
  description?: string | null;
  lock?: boolean;
}

interface RestoreTask {
  action: BackupAction;
  exists: boolean;
}

const CONCURRENCY = 10;
const DELAY_BETWEEN_REQUESTS_MS = 100;

/** Fetches all existing action IDs from the profile. */
async function fetchExistingActionIds(account: Account): Promise<Set<string>> {
  const actions = await account.actions.list({ amount: 10000, fields: ["id"] });
  return new Set(actions.map((a) => a.id));
}

/** Processes a single action restoration task. */
async function processRestoreTask(
  account: Account,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { action, exists } = task;

  try {
    const { id, ...actionData } = action;

    if (exists) {
      // @ts-expect-error backup data structure may differ from SDK types
      await account.actions.edit(id, actionData);
      result.updated++;
      spinner.text = `Restoring actions... (${result.created} created, ${result.updated} updated)`;
    } else {
      // @ts-expect-error backup data structure may differ from SDK types
      await account.actions.create(actionData);
      result.created++;
      spinner.text = `Restoring actions... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore action "${action.name}": ${errorMessage}`);
  }
}

/** Restores actions from backup. */
async function restoreActions(account: Account, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading actions data from backup...");
  const backupActions = readBackupFile<BackupAction>(extractDir, "actions.json");

  if (backupActions.length === 0) {
    infoMSG("No actions found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupActions.length.toString())} actions in backup.`);

  infoMSG("Fetching existing actions from profile...");
  const existingIds = await fetchExistingActionIds(account);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing actions in profile.`);

  console.info("");
  const spinner = ora("Restoring actions...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(account, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const action of backupActions) {
    const exists = existingIds.has(action.id);
    void restoreQueue.push({ action, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Actions restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreActions };
