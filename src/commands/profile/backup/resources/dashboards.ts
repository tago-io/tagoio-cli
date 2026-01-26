import { DashboardInfo, Resources, WidgetInfo } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface BackupWidget extends WidgetInfo {
  id: string;
}

interface BackupDashboard extends DashboardInfo {
  widgets?: BackupWidget[];
}

interface RestoreTask {
  dashboard: BackupDashboard;
  exists: boolean;
}

const CONCURRENCY = 1;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Fetches all existing dashboard IDs from the profile. */
async function fetchExistingDashboardIds(resources: Resources): Promise<Set<string>> {
  const dashboards = await resources.dashboards.list({ amount: 10000, fields: ["id"] });
  return new Set(dashboards.map((d) => d.id));
}

/** Creates widgets for a new dashboard and returns the old-to-new ID mapping. */
async function createWidgets(
  resources: Resources,
  dashboardId: string,
  widgets: BackupWidget[]
): Promise<Map<string, string>> {
  const idMapping = new Map<string, string>();

  for (const widget of widgets) {
    const { id: oldId, dashboard: _dashboard, ...widgetData } = widget;
    const created = await resources.dashboards.widgets.create(dashboardId, widgetData);
    idMapping.set(oldId, created.widget);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }

  return idMapping;
}

/** Edits existing widgets for a dashboard. */
async function editWidgets(resources: Resources, dashboardId: string, widgets: BackupWidget[]): Promise<void> {
  for (const widget of widgets) {
    const { id: widgetId, dashboard: _dashboard, ...widgetData } = widget;
    await resources.dashboards.widgets.edit(dashboardId, widgetId, widgetData);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }
}

/** Updates arrangement with new widget IDs. */
function updateArrangement(
  arrangement: DashboardInfo["arrangement"],
  idMapping: Map<string, string>
): DashboardInfo["arrangement"] {
  if (!arrangement) {
    return arrangement;
  }

  return arrangement.map((item) => ({
    ...item,
    widget_id: idMapping.get(item.widget_id) || item.widget_id,
  }));
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
    const { id, widgets, arrangement, ...dashboardData } = dashboard;

    if (exists) {
      await resources.dashboards.edit(id, { ...dashboardData, arrangement });
      result.updated++;
      spinner.text = `Restoring dashboards... (${result.created} created, ${result.updated} updated)`;

      if (widgets && widgets.length > 0) {
        await editWidgets(resources, id, widgets);
      }
    } else {
      const created = await resources.dashboards.create({ ...dashboardData, arrangement: [] });
      const dashboardId = created.dashboard;
      result.created++;
      spinner.text = `Restoring dashboards... (${result.created} created, ${result.updated} updated)`;

      if (widgets && widgets.length > 0) {
        const idMapping = await createWidgets(resources, dashboardId, widgets);
        const updatedArrangement = updateArrangement(arrangement, idMapping);
        await resources.dashboards.edit(dashboardId, { arrangement: updatedArrangement });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to restore dashboard "${dashboard.label}": ${getErrorMessage(error)}`);
  }
}

/** Restores dashboards from backup. */
async function restoreDashboards(resources: Resources, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading dashboards data from backup...");
  const backupDashboards = readBackupFile<BackupDashboard>(extractDir, "dashboards.json");

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
