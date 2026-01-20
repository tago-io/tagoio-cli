import { DictionaryInfo, Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  dictionary: DictionaryInfo;
  exists: boolean;
}

const CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Fetches all existing dictionary IDs from the profile. */
async function fetchExistingDictionaryIds(resources: Resources): Promise<Set<string>> {
  const dictionaries = await resources.dictionaries.list({ amount: 10000, fields: ["id"] });
  return new Set(dictionaries.map((d) => d.id));
}

/** Processes a single dictionary restoration task. */
async function processRestoreTask(
  resources: Resources,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { dictionary, exists } = task;

  try {
    const { id, ...dictionaryData } = dictionary;

    if (exists) {
      await resources.dictionaries.edit(id, dictionaryData);
      result.updated++;
      spinner.text = `Restoring dictionaries... (${result.created} created, ${result.updated} updated)`;
    } else {
      await resources.dictionaries.create(dictionaryData);
      result.created++;
      spinner.text = `Restoring dictionaries... (${result.created} created, ${result.updated} updated)`;
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nFailed to restore dictionary "${dictionary.name}": ${errorMessage}`);
  }
}

/** Restores dictionaries from backup. */
async function restoreDictionaries(resources: Resources, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading dictionaries data from backup...");
  const backupDictionaries = readBackupFile<DictionaryInfo>(extractDir, "dictionaries.json");

  if (backupDictionaries.length === 0) {
    infoMSG("No dictionaries found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupDictionaries.length.toString())} dictionaries in backup.`);

  infoMSG("Fetching existing dictionaries from profile...");
  const existingIds = await fetchExistingDictionaryIds(resources);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing dictionaries in profile.`);

  console.info("");
  const spinner = ora("Restoring dictionaries...").start();

  const restoreQueue = queue<RestoreTask>(async (task) => {
    await processRestoreTask(resources, task, result, spinner);
  }, CONCURRENCY);

  restoreQueue.error((error) => {
    errorHandler(`Queue error: ${error}`);
  });

  for (const dictionary of backupDictionaries) {
    const exists = existingIds.has(dictionary.id);
    void restoreQueue.push({ dictionary, exists });
  }

  await restoreQueue.drain();

  spinner.succeed(`Dictionaries restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreDictionaries };
