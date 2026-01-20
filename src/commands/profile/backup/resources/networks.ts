import { NetworkInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  network: NetworkInfo;
  exists: boolean;
}

const CONCURRENCY = 5;
const DELAY_BETWEEN_REQUESTS_MS = 150;

/** Fetches all existing network IDs from the profile. */
async function fetchExistingNetworkIds(resources: Resources): Promise<Set<string>> {
  const networks = await resources.integration.networks.list({ amount: 10000, fields: ["id"] });
  return new Set(networks.map((n) => n.id));
}

/** Processes a single network restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { network, exists } = task;

  try {
    const { id, ...networkData } = network;

    if (exists) {
      await resources.integration.networks.edit(id, networkData);
      result.updated++;
      spinner.text = `Restoring networks... (${result.created} created, ${result.updated} updated)`;
    } else {
      await resources.integration.networks.create(networkData);
      result.created++;
      spinner.text = `Restoring networks... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore network "${network.name}": ${errorMessage}`);
  }
}

/** Restores networks from backup. */
async function restoreNetworks(resources: Resources, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading networks data from backup...");
  const backupNetworks = readBackupFile<NetworkInfo>(extractDir, "networks.json");

  if (backupNetworks.length === 0) {
    infoMSG("No networks found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupNetworks.length.toString())} networks in backup.`);

  infoMSG("Fetching existing networks from profile...");
  const existingIds = await fetchExistingNetworkIds(resources);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing networks in profile.`);

  console.info("");
  const spinner = ora("Restoring networks...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const network of backupNetworks) {
    const exists = existingIds.has(network.id);
    void restoreQueue.push({ network, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Networks restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreNetworks };
