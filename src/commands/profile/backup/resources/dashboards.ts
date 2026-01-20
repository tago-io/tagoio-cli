import { DashboardInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  dashboard: DashboardInfo;
  exists: boolean;
}

const CONCURRENCY = 10;
const DELAY_BETWEEN_REQUESTS_MS = 100;

/** Fetches all existing dashboard IDs from the profile. */
async function fetchExistingDashboardIds(resources: Resources): Promise<Set<string>> {
  const dashboards = await resources.dashboards.list({ amount: 10000, fields: ["id"] });
  return new Set(dashboards.map((d) => d.id));
}

/** Processes a single dashboard restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { dashboard, exists } = task;

  try {
    const { id, ...dashboardData } = dashboard;

    if (exists) {
      await resources.dashboards.edit(id, dashboardData);
      result.updated++;
      spinner.text = `Restoring dashboards... (${result.created} created, ${result.updated} updated)`;
    } else {
      await resources.dashboards.create(dashboardData);
      result.created++;
      spinner.text = `Restoring dashboards... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore dashboard "${dashboard.label}": ${errorMessage}`);
  }
}

/** Restores dashboards from backup. */
async function restoreDashboards(resources: Resources, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading dashboards data from backup...");
  const backupDashboards = readBackupFile<DashboardInfo>(extractDir, "dashboards.json");

  if (backupDashboards.length === 0) {
    infoMSG("No dashboards found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupDashboards.length.toString())} dashboards in backup.`);

  infoMSG("Fetching existing dashboards from profile...");
  const existingIds = await fetchExistingDashboardIds(resources);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing dashboards in profile.`);

  console.info("");
  const spinner = ora("Restoring dashboards...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const dashboard of backupDashboards) {
    const exists = existingIds.has(dashboard.id);
    void restoreQueue.push({ dashboard, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Dashboards restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreDashboards };
