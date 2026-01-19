import { Account, ConnectorInfo } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  connector: ConnectorInfo;
  exists: boolean;
}

const CONCURRENCY = 5;
const DELAY_BETWEEN_REQUESTS_MS = 150;

/** Fetches all existing connector IDs from the profile. */
async function fetchExistingConnectorIds(account: Account): Promise<Set<string>> {
  const connectors = await account.integration.connectors.list({ amount: 10000, fields: ["id"] });
  return new Set(connectors.map((c) => c.id));
}

/** Processes a single connector restoration task. */
async function processRestoreTask(
  account: Account,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { connector, exists } = task;

  try {
    const { id, ...connectorData } = connector;

    if (exists) {
      await account.integration.connectors.edit(id, connectorData);
      result.updated++;
      spinner.text = `Restoring connectors... (${result.created} created, ${result.updated} updated)`;
    } else {
      await account.integration.connectors.create(connectorData);
      result.created++;
      spinner.text = `Restoring connectors... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore connector "${connector.name}": ${errorMessage}`);
  }
}

/** Restores connectors from backup. */
async function restoreConnectors(account: Account, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading connectors data from backup...");
  const backupConnectors = readBackupFile<ConnectorInfo>(extractDir, "connectors.json");

  if (backupConnectors.length === 0) {
    infoMSG("No connectors found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupConnectors.length.toString())} connectors in backup.`);

  infoMSG("Fetching existing connectors from profile...");
  const existingIds = await fetchExistingConnectorIds(account);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing connectors in profile.`);

  console.info("");
  const spinner = ora("Restoring connectors...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(account, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const connector of backupConnectors) {
    const exists = existingIds.has(connector.id);
    void restoreQueue.push({ connector, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Connectors restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreConnectors };
