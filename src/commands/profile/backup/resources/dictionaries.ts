import { Resources } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { errorHandler, highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupFile, selectItemsFromBackup } from "../lib";
import { RestoreResult } from "../types";

interface BackupLanguage {
  dictionary: string;
  code: string;
  data: Record<string, string>;
  active: boolean;
}

interface BackupDictionary {
  id: string;
  name: string;
  slug: string;
  fallback: string;
  profile?: string;
  created_at?: string | Date;
  updated_at?: string | Date;
  languages?: BackupLanguage[];
}

interface RestoreTask {
  dictionary: BackupDictionary;
  exists: boolean;
}

const CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 300;

/** Fetches all existing dictionary IDs from the profile. */
async function fetchExistingDictionaryIds(resources: Resources): Promise<Set<string>> {
  const dictionaries = await resources.dictionaries.list({ amount: 10000, fields: ["id"] });
  return new Set(dictionaries.map((d) => d.id));
}

/** Restores languages for a dictionary. */
async function restoreLanguages(resources: Resources, dictionaryId: string, languages: BackupLanguage[]): Promise<void> {
  for (const language of languages) {
    await resources.dictionaries.languageEdit(dictionaryId, language.code, {
      dictionary: language.data,
      active: language.active,
    });
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }
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
    const { id, languages, ...dictionaryData } = dictionary;
    let dictionaryId = id;

    if (exists) {
      await resources.dictionaries.edit(id, dictionaryData);
      result.updated++;
      spinner.text = `Restoring dictionaries... (${result.created} created, ${result.updated} updated)`;
    } else {
      const created = await resources.dictionaries.create(dictionaryData);
      dictionaryId = created.dictionary;
      result.created++;
      spinner.text = `Restoring dictionaries... (${result.created} created, ${result.updated} updated)`;
    }

    if (languages && languages.length > 0) {
      await restoreLanguages(resources, dictionaryId, languages);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to restore dictionary "${dictionary.name}": ${getErrorMessage(error)}`);
  }
}

/** Restores dictionaries from backup. */
async function restoreDictionaries(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading dictionaries data from backup...");
  let backupDictionaries = readBackupFile<BackupDictionary>(extractDir, "dictionaries.json");

  if (backupDictionaries.length === 0) {
    infoMSG("No dictionaries found in backup.");
    return result;
  }

  if (granularItem) {
    const itemsWithName = backupDictionaries.map((d) => ({ ...d, id: d.id, name: d.name }));
    const selected = await selectItemsFromBackup(itemsWithName, "dictionaries");
    if (!selected || selected.length === 0) {
      infoMSG("No dictionaries selected. Skipping.");
      return result;
    }
    backupDictionaries = selected as BackupDictionary[];
  }

  infoMSG(`Restoring ${highlightMSG(backupDictionaries.length.toString())} dictionaries...`);

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
