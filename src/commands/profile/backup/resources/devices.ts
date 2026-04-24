import { ConfigurationParams, DeviceInfo, Resources, TokenData } from "@tago-io/sdk";
import { queue } from "async";
import ora, { type Ora } from "ora";

import { highlightMSG, infoMSG } from "../../../../lib/messages.js";
import { getErrorMessage, readBackupFile, selectItemsFromBackup } from "../lib.js";
import { RestoreResult } from "../types.js";

interface RestoreTask {
  device: DeviceInfo;
  exists: boolean;
}

const CREATE_CONCURRENCY = 8;
const EDIT_CONCURRENCY = 3;
const DELAY_BETWEEN_REQUESTS_MS = 100;

/** Fetches all existing device IDs from the profile. */
async function fetchExistingDeviceIds(resources: Resources): Promise<Set<string>> {
  const devices = await resources.devices.list({ amount: 10000, fields: ["id"] });
  return new Set(devices.map((d) => d.id));
}

/**
 * Strips fields that the TagoIO API rejects or manages on its own (IDs,timestamps, tokens,
 * and config parameters — the last two are restored via separate endpoints).
 * Returns the subset safe to send to `resources.devices.create` / `resources.devices.edit`.
 */
function stripDeviceFields(device: DeviceInfo) {
  const {
    id: _id,
    created_at: _created_at,
    updated_at: _updated_at,
    last_input: _last_input,
    profile: _profile,
    params: _params,
    tokens: _tokens,
    ...deviceData
  } = device as DeviceInfo & { params?: ConfigurationParams[]; tokens?: TokenData[] };
  return deviceData;
}

/**
 * Restores configuration parameters for a device using the dedicated `paramSet` endpoint.
 */
async function restoreDeviceParams(resources: Resources, deviceId: string, device: DeviceInfo & { params?: ConfigurationParams[] }): Promise<void> {
  const params = device.params;
  if (!params || params.length === 0) {
    return;
  }
  const payload = params.map(({ key, value, sent }) => ({ key, value, sent }));
  await resources.devices.paramSet(deviceId, payload);
}

/**
 * Recreates device tokens from the backup using `tokenCreate`. Only tokens
 * that carry a `serie_number` are recreated — the serial number is what
 * identifies the physical device and is the reason to preserve the token at
 * all. Tokens without a serie_number are ephemeral credentials and are
 * intentionally skipped.
 *
 * When `deviceExists` is true (edit path), the current tokens on the
 * destination device are fetched first. Any backup token whose
 * `serie_number` is already present on the device is skipped.
 *
 * The token's actual value cannot be restored: the backup stores it masked
 * (e.g. `********-****-****-****-************a888`), so the new token has
 * a different value. Integrations relying on the old token value must be
 * updated.
 */
async function restoreDeviceTokens(resources: Resources, deviceId: string, device: DeviceInfo & { tokens?: TokenData[] }, deviceExists: boolean) {
  const tokens = device.tokens;
  if (!tokens || tokens.length === 0) {
    return;
  }

  let existingSerials = new Set<string>();
  if (deviceExists) {
    const currentTokens = await resources.devices.tokenList(deviceId, { amount: 10000, fields: ["serie_number"] });
    existingSerials = new Set(currentTokens.map((t) => t.serie_number).filter((s): s is string => Boolean(s)));
  }

  for (const token of tokens) {
    if (!token.serie_number) {
      continue;
    }
    if (existingSerials.has(token.serie_number)) {
      continue;
    }

    try {
      await resources.devices.tokenCreate(deviceId, {
        name: token.name,
        permission: token.permission,
        serie_number: token.serie_number,
        expire_time: token.expire_time || undefined,
      });
    } catch (error) {
      console.error(`\nFailed to recreate token "${token.name}" for device "${device.name}": ${getErrorMessage(error)}`);
    }
  }
}

/** Processes a single device creation task. */
async function processCreateTask(resources: Resources, task: RestoreTask, result: RestoreResult, spinner: Ora): Promise<void> {
  const { device } = task;

  try {
    const { device_id } = await resources.devices.create(stripDeviceFields(device));
    await restoreDeviceParams(resources, device_id, device);
    await restoreDeviceTokens(resources, device_id, device, false);
    result.created++;
    spinner.text = `Restoring devices... (${result.created} created, ${result.updated} updated)`;
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to create device "${device.name}": ${getErrorMessage(error)}`);
  }
}

/** Processes a single device edit task. */
async function processEditTask(resources: Resources, task: RestoreTask, result: RestoreResult, spinner: Ora): Promise<void> {
  const { device } = task;

  try {
    const { network: _network, connector: _connector, ...deviceData } = stripDeviceFields(device);
    await resources.devices.edit(device.id, deviceData);
    await restoreDeviceParams(resources, device.id, device);
    await restoreDeviceTokens(resources, device.id, device, true);
    result.updated++;
    spinner.text = `Restoring devices... (${result.created} created, ${result.updated} updated)`;
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  } catch (error) {
    result.failed++;
    console.error(`\nFailed to update device "${device.name}": ${getErrorMessage(error)}`);
  }
}

/** Restores devices from backup. */
async function restoreDevices(resources: Resources, extractDir: string, granularItem?: boolean): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, failed: 0 };

  infoMSG("Reading devices data from backup...");
  let backupDevices = readBackupFile<DeviceInfo>(extractDir, "devices.json");

  if (backupDevices.length === 0) {
    infoMSG("No devices found in backup.");
    return result;
  }

  if (granularItem) {
    const itemsWithName = backupDevices.map((d) => ({ ...d, id: d.id, name: d.name }));
    const selected = await selectItemsFromBackup(itemsWithName, "devices");
    if (!selected || selected.length === 0) {
      infoMSG("No devices selected. Skipping.");
      return result;
    }
    backupDevices = selected as DeviceInfo[];
  }

  infoMSG(`Restoring ${highlightMSG(backupDevices.length.toString())} devices...`);

  infoMSG("Fetching existing devices from profile...");
  const existingIds = await fetchExistingDeviceIds(resources);
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
    await processCreateTask(resources, task, result, spinner);
  }, CREATE_CONCURRENCY);

  const editQueue = queue<RestoreTask>(async (task) => {
    await processEditTask(resources, task, result, spinner);
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
