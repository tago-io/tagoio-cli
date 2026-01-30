import { ConnectorInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile, selectItemsFromBackup } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  connector: ConnectorInfo;
  exists: boolean;
}

const CONCURRENCY = 5;
const DELAY_BETWEEN_REQUESTS_MS = 150;

/** Fetches all existing connector IDs from the profile. */
async function fetchExistingConnectorIds(resources: Resources): Promise<Set<string>> {
  const connectors = await resources.integration.connectors.list({ amount: 10000, fields: ["id"] });
  return new Set(connectors.map((c) => c.id));
}

/** Processes a single connector restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { connector, exists } = task;

  try {
    const { id, ...connectorData } = connector;

    if (exists) {
      await resources.integration.connectors.edit(id, connectorData);
      result.updated++;
      spinner.text = `Restoring connectors... (${result.created} created, ${result.updated} updated)`;
    } else {
      await resources.integration.connectors.create(connectorData);
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
async function restoreConnectors(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading connectors data from backup...");
  let backupConnectors = readBackupFile<ConnectorInfo>(extractDir, "connectors.json");

  if (backupConnectors.length === 0) {
    infoMSG("No connectors found in backup.");
    return result;
  }

  if (granularItem) {
    const itemsWithName = backupConnectors.map((c) => ({ ...c, id: c.id, name: c.name as string }));
    const selected = await selectItemsFromBackup(itemsWithName, "connectors");
    if (!selected || selected.length === 0) {
      infoMSG("No connectors selected. Skipping.");
      return result;
    }
    backupConnectors = selected as ConnectorInfo[];
  }

  infoMSG(`Restoring ${highlightMSG(backupConnectors.length.toString())} connectors...`);

  infoMSG("Fetching existing connectors from profile...");
  const existingIds = await fetchExistingConnectorIds(resources);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing connectors in profile.`);

  console.info("");
  const spinner = ora("Restoring connectors...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
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
