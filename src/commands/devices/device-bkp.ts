import { readFileSync, writeFileSync } from "fs";
import axios from "axios";
import kleur from "kleur";
import { DateTime } from "luxon";

import { Account, Device, Utils } from "@tago-io/sdk";
import { Data, DeviceInfo, DeviceItem } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";
import { pickFileFromTagoIO } from "../../prompt/pick-files-from-tagoio";
import { promptTextToEnter } from "../../prompt/text-prompt";

interface IOptions {
  environment?: string;
  restore: boolean;
  local: boolean;
}

// function to get a JSON file from an URL using Axios
async function getJSON(url: string, authorization: string) {
  const { data } = await axios.get(url, { headers: { Authorization: authorization } });
  return data;
}

async function restoreBKP(account: Account, profileToken: string, device: Device, deviceInfo: DeviceInfo | DeviceItem, local: boolean) {
  const { name, id } = deviceInfo;

  let dataList: Data[] = [];

  if (!local) {
    const fileName = await pickFileFromTagoIO(account);
    if (!fileName) {
      errorHandler("No file selected");
      return;
    }
    dataList = await getJSON(fileName, profileToken);
  } else {
    const filePath = await promptTextToEnter("File path", `./${id}.json`);
    if (!filePath) {
      errorHandler("No file selected");
      return;
    }
    dataList = JSON.parse(readFileSync(filePath, "utf8"));
  }

  await account.devices.emptyDeviceData(id);
  await device.sendDataStreaming(dataList, { poolingRecordQty: 10_000, poolingTime: 1000 });
  successMSG(`> ${name} - ${dataList.length} data points`);
}

async function storeBKP(account: Account, device: Device, deviceInfo: DeviceInfo | DeviceItem, local: boolean) {
  const { created_at, name, id } = deviceInfo;

  // Start date with luxon at created_at and increase 1 month on a loop until today
  const startDate = DateTime.fromJSDate(created_at).startOf("month");
  const endDate = DateTime.local().startOf("month");
  const months = endDate.diff(startDate, "months").months;
  let dataList: Data[] = [];

  for (let i = 0; i <= months; i++) {
    const month = startDate.plus({ months: i });
    const monthName = month.toFormat("yyyy-MM");
    const monthData = await device
      .getData({
        start_date: month.toISODate() as string,
        end_date: month.plus({ months: 1 }).toISODate() as string,
        qty: 10_000,
      })
      .catch(errorHandler);

    if (!monthData) {
      continue;
    }

    dataList = dataList.concat(monthData);

    successMSG(`> ${monthName} - ${monthData.length} data points`);
  }

  if (!local) {
    const filePath = await promptTextToEnter("Enter the file path to store the backup", `deviceBackup/${id}.json`);
    await Utils.uploadFile(account, {
      filename: filePath,
      file_base64: Buffer.from(JSON.stringify(dataList, null, 4)).toString("base64"),
      public: true,
    });

    return successMSG(`> Backup stored on TagoIO Local Files: ${kleur.cyan(filePath)}`);
  }

  // store dataList on local
  writeFileSync(`./${id}.json`, JSON.stringify(dataList, null, 4));
  successMSG(`> Backup stored on ${name}.json`);
}

/**
 * Backs up or restores data from a TagoIO device.
 * @param idOrToken - The ID or token of the device to backup or restore.
 * @param options - Additional options for the backup or restore process.
 * @param options.environment - The environment to use for the backup or restore process.
 * @param options.restore - Whether to restore data from a backup.
 * @param options.local - Whether to store the backup locally or on TagoIO.
 * @returns A Promise that resolves when the backup or restore process is complete.
 */
async function bkpDeviceData(idOrToken: string, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(account);
  }

  const deviceInfo = await account.devices
    .info(idOrToken)
    .catch(() => {
      const device = new Device({ token: idOrToken, region: config.profileRegion });
      return device.info();
    })
    .catch(errorHandler);

  if (!deviceInfo) {
    return;
  }

  const device = await Utils.getDevice(account, idOrToken).catch(errorHandler);
  if (!device) {
    return;
  }

  if (options.restore) {
    infoMSG(`> Restoring data from ${deviceInfo.name}`);
    return restoreBKP(account, config.profileToken, device, deviceInfo, options.local);
  }

  infoMSG(`> Backing up data from ${deviceInfo.name}`);
  await storeBKP(account, device, deviceInfo, options.local);
}

export { bkpDeviceData };
