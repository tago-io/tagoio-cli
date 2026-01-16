import { Account } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface BackupPolicy {
  id: string;
  name: string;
  permissions: Array<{ effect: "allow" | "deny"; action: string[]; resource: string[] }>;
  targets: [];
  tags?: Array<{ key: string; value: string }>;
  active?: boolean;
}

interface RestoreTask {
  policy: BackupPolicy;
  exists: boolean;
}

const CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Fetches all existing access policy IDs from the profile. */
async function fetchExistingPolicyIds(account: Account): Promise<Set<string>> {
  const policies = await account.accessManagement.list({ amount: 10000, fields: ["id"] });
  return new Set(policies.map((p) => p.id));
}

/** Processes a single access policy restoration task. */
async function processRestoreTask(
  account: Account,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { policy, exists } = task;

  try {
    const { id, ...policyData } = policy;

    if (exists) {
      await account.accessManagement.edit(id, policyData);
      result.updated++;
      spinner.text = `Restoring access policies... (${result.created} created, ${result.updated} updated)`;
    } else {
      await account.accessManagement.create(policyData);
      result.created++;
      spinner.text = `Restoring access policies... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore policy "${policy.name}": ${errorMessage}`);
  }
}

/** Restores access management policies from backup. */
async function restoreAccessManagement(account: Account, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading access management data from backup...");
  const backupPolicies = readBackupFile<BackupPolicy>(extractDir, "access_management.json");

  if (backupPolicies.length === 0) {
    infoMSG("No access management policies found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupPolicies.length.toString())} access policies in backup.`);

  infoMSG("Fetching existing access policies from profile...");
  const existingIds = await fetchExistingPolicyIds(account);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing policies in profile.`);

  console.info("");
  const spinner = ora("Restoring access policies...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(account, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const policy of backupPolicies) {
    const exists = existingIds.has(policy.id);
    void restoreQueue.push({ policy, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Access policies restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreAccessManagement };
