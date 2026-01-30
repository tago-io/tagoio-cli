import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { createGunzip } from "node:zlib";

import { AnalysisInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupFile, selectItemsFromBackup } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  analysis: AnalysisInfo;
  exists: boolean;
}

const CONCURRENCY = 1;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Reads and decompresses a gzipped script file. */
async function readGzippedScript(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();

    createReadStream(filePath)
      .pipe(gunzip)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
      .on("error", reject);
  });
}

/** Determines the script language based on the analysis runtime. */
function getScriptLanguage(runtime?: string): "node" | "python" {
  if (!runtime) {
    return "node";
  }
  if (runtime.toLowerCase().includes("python")) {
    return "python";
  }
  return "node";
}

/** Uploads script for an analysis if available. */
async function uploadAnalysisScript(
  resources: Resources,
  analysisId: string,
  originalId: string,
  extractDir: string,
  runtime?: string
): Promise<boolean> {
  const scriptPath = join(extractDir, "versioning", "analysis", `${originalId}.gz`);

  if (!existsSync(scriptPath)) {
    return false;
  }

  const scriptContent = await readGzippedScript(scriptPath);
  const language = getScriptLanguage(runtime);
  const fileName = language === "python" ? "script.py" : "script.js";
  const base64Content = Buffer.from(scriptContent).toString("base64");

  await resources.analysis.uploadScript(analysisId, {
    name: fileName,
    content: base64Content,
    language,
  });

  return true;
}

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
  spinner: ora.Ora,
  extractDir: string
): Promise<void> {
  const { analysis, exists } = task;

  try {
    const { id: originalId, ...analysisData } = analysis;
    let analysisId = originalId;

    if (exists) {
      await resources.analysis.edit(originalId, analysisData);
      result.updated++;
      spinner.text = `Restoring analysis... (${result.created} created, ${result.updated} updated)`;
    } else {
      const created = await resources.analysis.create(analysisData);
      analysisId = created.id;
      result.created++;
      spinner.text = `Restoring analysis... (${result.created} created, ${result.updated} updated)`;
    }

    await uploadAnalysisScript(resources, analysisId, originalId, extractDir, analysis.runtime);

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to restore analysis "${analysis.name}": ${getErrorMessage(error)}`);
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
    await processRestoreTask(resources, task, result, spinner, extractDir);
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
