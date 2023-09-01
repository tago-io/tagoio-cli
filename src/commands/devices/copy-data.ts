import { Account, Device, Utils } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";
import { confirmPrompt } from "../../prompt/confirm";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";

interface IOptions {
  to: string;
  from: string;
  environment: string;
  amount: number;
}

async function startCopy(deviceFrom: Device, deviceTo: Device, options: IOptions) {
  const { amount } = options;

  const dataStream = deviceFrom.getDataStreaming({}, { poolingRecordQty: 2000, poolingTime: 400, neverStop: false });

  let total = 0;
  for await (let data of dataStream) {
    data = data.filter((x) => x.variable !== "payload");
    total += data.length;
    await deviceTo.sendData(data);
    if (total >= amount) {
      break;
    }
  }

  successMSG(`> Data copy done. A total of ${total} registers were copied.`);
}

async function copyDeviceData(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  if (!options.from || !options.to) {
    const account = new Account({ token: config.profileToken, region: "usa-1" });
    options.from = await pickDeviceIDFromTagoIO(account, "Pick a device to copy the data from:");
    options.to = await pickDeviceIDFromTagoIO(account, "Pick a device to copy the data to: ");
  }

  let deviceFrom: Device | undefined;
  let deviceTo: Device | undefined;
  if (options.from?.length === 24 || options.to?.length === 24) {
    const account = new Account({ token: config.profileToken, region: "usa-1" });

    if (options.from.length === 24) {
      deviceFrom = await Utils.getDevice(account, options.from);
    }

    if (options.to.length === 24) {
      deviceTo = await Utils.getDevice(account, options.to);
    }
  }

  if (!deviceTo || !deviceFrom) {
    errorHandler("Device not found");
    return;
  }

  if (!deviceFrom) {
    deviceFrom = new Device({ token: options.from });
  }

  if (!deviceTo) {
    deviceTo = new Device({ token: options.to });
  }

  const deviceToInfo = await deviceTo.info();
  const deviceFromInfo = await deviceFrom.info();

  infoMSG(`> Copying tab ${highlightMSG(deviceFromInfo.name)} to ${highlightMSG(deviceToInfo.name)}...`);
  const yesNo = await confirmPrompt();
  if (!yesNo) {
    return;
  }

  await startCopy(deviceFrom, deviceTo, options);
}

export { copyDeviceData };
