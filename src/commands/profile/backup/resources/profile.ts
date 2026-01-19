import { Account, ProfileInfo } from "@tago-io/sdk";
import ora from "ora";

import { highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupSingleFile } from "../lib";
import { RestoreResult } from "../types";

interface BackupProfile {
  id: string;
  name: string;
  account: string;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
  resource_allocation: {
    analysis: number;
    data_records: number;
    sms: number;
    email: number;
    run_users: number;
    push_notification: number;
    file_storage: number;
  };
}

/** Transforms flat backup structure to SDK ProfileInfo format. */
function transformToProfileInfo(backup: BackupProfile): Partial<ProfileInfo> {
  return {
    info: {
      id: backup.id,
      account: backup.account,
      name: backup.name,
      logo_url: backup.logo_url,
      banner_url: backup.banner_url,
      created_at: new Date(backup.created_at),
      updated_at: new Date(backup.updated_at),
    },
    allocation: {
      input: 0,
      output: 0,
      analysis: backup.resource_allocation.analysis,
      data_records: backup.resource_allocation.data_records,
      sms: backup.resource_allocation.sms,
      email: backup.resource_allocation.email,
      run_users: backup.resource_allocation.run_users,
      push_notification: backup.resource_allocation.push_notification,
      file_storage: backup.resource_allocation.file_storage,
    },
  };
}

/** Restores profile settings from backup. */
async function restoreProfile(account: Account, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading profile data from backup...");
  const backupProfile = readBackupSingleFile<BackupProfile>(extractDir, "profile.json");

  if (!backupProfile) {
    infoMSG("No profile data found in backup.");
    return result;
  }

  infoMSG(`Found profile ${highlightMSG(backupProfile.name)} in backup.`);

  console.info("");
  const spinner = ora("Restoring profile settings...").start();

  try {
    const profileData = transformToProfileInfo(backupProfile);
    await account.profiles.edit(backupProfile.id, profileData);
    result.updated++;
    spinner.succeed(`Profile restored: ${backupProfile.name}`);
  } catch (error) {
    result.failed++;
    spinner.fail(`Failed to restore profile: ${getErrorMessage(error)}`);
  }

  return result;
}

export { restoreProfile };
