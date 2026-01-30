import { AccessInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile, selectItemsFromBackup } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  policy: AccessInfo;
  exists: boolean;
}

const CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Fetches all existing access policy IDs from the profile. */
async function fetchExistingPolicyIds(resources: Resources): Promise<Set<string>> {
  const policies = await resources.accessManagement.list({ amount: 10000, fields: ["id"] });
  return new Set(policies.map((p) => p.id));
}

/** Processes a single access policy restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { policy, exists } = task;

  try {
    const { id, ...policyData } = policy;

    if (exists) {
      await resources.accessManagement.edit(id, policyData);
      result.updated++;
      spinner.text = `Restoring access policies... (${result.created} created, ${result.updated} updated)`;
    } else {
      await resources.accessManagement.create(policyData);
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
async function restoreAccessManagement(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading access management data from backup...");
  let backupPolicies = readBackupFile<AccessInfo>(extractDir, "access_management.json");

  if (backupPolicies.length === 0) {
    infoMSG("No access management policies found in backup.");
    return result;
  }

  if (granularItem) {
    const itemsWithName = backupPolicies.map((p) => ({ ...p, id: p.id, name: p.name }));
    const selected = await selectItemsFromBackup(itemsWithName, "access policies");
    if (!selected || selected.length === 0) {
      infoMSG("No access policies selected. Skipping.");
      return result;
    }
    backupPolicies = selected as AccessInfo[];
  }

  infoMSG(`Restoring ${highlightMSG(backupPolicies.length.toString())} access policies...`);

  infoMSG("Fetching existing access policies from profile...");
  const existingIds = await fetchExistingPolicyIds(resources);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing policies in profile.`);

  console.info("");
  const spinner = ora("Restoring access policies...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
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
