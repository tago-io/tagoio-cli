import { Account, RunInfo } from "@tago-io/sdk";
import ora from "ora";

import { highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupSingleFile } from "../lib";
import { RestoreResult } from "../types";

interface BackupRun extends RunInfo {
  created_at?: string;
}

/** Restores run settings from backup. */
async function restoreRun(account: Account, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading run data from backup...");
  const backupRun = readBackupSingleFile<BackupRun>(extractDir, "run.json");

  if (!backupRun) {
    infoMSG("No run data found in backup.");
    return result;
  }

  infoMSG(`Found run ${highlightMSG(backupRun.name)} in backup.`);

  console.info("");
  const spinner = ora("Restoring run settings...").start();

  try {
    const { created_at: _created_at, ...runData } = backupRun;
    await account.run.edit(runData);
    result.updated++;
    spinner.succeed(`Run restored: ${backupRun.name}`);
  } catch (error) {
    result.failed++;
    spinner.fail(`Failed to restore run: ${getErrorMessage(error)}`);
  }

  return result;
}

export { restoreRun };
