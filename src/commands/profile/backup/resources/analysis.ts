import { AnalysisInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile, selectItemsFromBackup } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  analysis: AnalysisInfo;
  exists: boolean;
}

const CONCURRENCY = 10;
const DELAY_BETWEEN_REQUESTS_MS = 100;

/** Fetches all existing analysis IDs from the profile. */
async function fetchExistingAnalysisIds(resources: Resources): Promise<Set<string>> {
  const analyses = await resources.analysis.list({ amount: 10000, fields: ["id"] });
  return new Set(analyses.map((a) => a.id));
}

/** Processes a single analysis restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { analysis, exists } = task;

  try {
    const { id, ...analysisData } = analysis;

    if (exists) {
      await resources.analysis.edit(id, analysisData);
      result.updated++;
      spinner.text = `Restoring analysis... (${result.created} created, ${result.updated} updated)`;
    } else {
      await resources.analysis.create(analysisData);
      result.created++;
      spinner.text = `Restoring analysis... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore analysis "${analysis.name}": ${errorMessage}`);
  }
}

/** Restores analysis from backup. */
async function restoreAnalysis(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading analysis data from backup...");
  let backupAnalyses = readBackupFile<AnalysisInfo>(extractDir, "analysis.json");

  if (backupAnalyses.length === 0) {
    infoMSG("No analysis found in backup.");
    return result;
  }

  if (granularItem) {
    const itemsWithName = backupAnalyses.map((a) => ({ ...a, id: a.id, name: a.name }));
    const selected = await selectItemsFromBackup(itemsWithName, "analysis");
    if (!selected || selected.length === 0) {
      infoMSG("No analysis selected. Skipping.");
      return result;
    }
    backupAnalyses = selected as AnalysisInfo[];
  }

  infoMSG(`Restoring ${highlightMSG(backupAnalyses.length.toString())} analysis...`);

  infoMSG("Fetching existing analysis from profile...");
  const existingIds = await fetchExistingAnalysisIds(resources);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing analysis in profile.`);

  console.info("");
  const spinner = ora("Restoring analysis...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const analysis of backupAnalyses) {
    const exists = existingIds.has(analysis.id);
    void restoreQueue.push({ analysis, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Analysis restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreAnalysis };
