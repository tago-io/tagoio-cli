import { Account, DeviceInfo } from "@tago-io/sdk";
import { queue } from "async";
import ora from "ora";

import { highlightMSG, infoMSG } from "../../../../lib/messages";
import { getErrorMessage, readBackupFile } from "../lib";
import { RestoreResult } from "../types";

interface RestoreTask {
  device: DeviceInfo;
  exists: boolean;
}

const CREATE_CONCURRENCY = 8;
const EDIT_CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 100;

/** Fetches all existing device IDs from the profile. */
async function fetchExistingDeviceIds(account: Account): Promise<Set<string>> {
  const devices = await account.devices.list({ amount: 10000, fields: ["id"] });
  return new Set(devices.map((d) => d.id));
}

/** Processes a single device creation task. */
async function processCreateTask(
  account: Account,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { device } = task;

  try {
    const { ...deviceData } = device;
    await account.devices.create(deviceData);
    result.created++;
    spinner.text = `Restoring devices... (${result.created} created, ${result.updated} updated)`;
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to create device "${device.name}": ${getErrorMessage(error)}`);
  }
}

/** Processes a single device edit task. */
async function processEditTask(
  account: Account,
  task: RestoreTask,
  result: RestoreResult,
  spinner: ora.Ora
): Promise<void> {
  const { device } = task;

  try {
    const { id, network: _network, connector: _connector, updated_at: _updated_at, ...deviceData } = device;
    await account.devices.edit(id, deviceData);
    result.updated++;
    spinner.text = `Restoring devices... (${result.created} created, ${result.updated} updated)`;
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to update device "${device.name}": ${getErrorMessage(error)}`);
  }
}

/** Restores devices from backup. */
async function restoreDevices(account: Account, extractDir: string): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading devices data from backup...");
  const backupDevices = readBackupFile<DeviceInfo>(extractDir, "devices.json");

  if (backupDevices.length === 0) {
    infoMSG("No devices found in backup.");
    return result;
  }

  infoMSG(`Found ${highlightMSG(backupDevices.length.toString())} devices in backup.`);

  infoMSG("Fetching existing devices from profile...");
  const existingIds = await fetchExistingDeviceIds(account);
  infoMSG(`Found ${highlightMSG(existingIds.size.toString())} existing devices in profile.`);

  const devicesToCreate: RestoreTask[] = [];
  const devicesToEdit: RestoreTask[] = [];

  for (const device of backupDevices) {
    const exists = existingIds.has(device.id);
    if (exists) {
      devicesToEdit.push({ device, exists });
    } else {
      devicesToCreate.push({ device, exists });
    }
  }

  console.info("");
  const spinner = ora("Restoring devices...").start();

  const createQueue = queue<RestoreTask>(async (task) => {
    await processCreateTask(account, task, result, spinner);
  }, CREATE_CONCURRENCY);

  const editQueue = queue<RestoreTask>(async (task) => {
    await processEditTask(account, task, result, spinner);
  }, EDIT_CONCURRENCY);

  createQueue.error((error) => {
    console.error(`\nCreate queue error: ${getErrorMessage(error)}`);
  });

  editQueue.error((error) => {
    console.error(`\nEdit queue error: ${getErrorMessage(error)}`);
  });

  for (const task of devicesToCreate) {
    void createQueue.push(task);
  }

  for (const task of devicesToEdit) {
    void editQueue.push(task);
  }

  if (devicesToCreate.length > 0) {
    await createQueue.drain();
  }

  if (devicesToEdit.length > 0) {
    await editQueue.drain();
  }

  spinner.succeed(`Devices restored: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

export { restoreDevices };
