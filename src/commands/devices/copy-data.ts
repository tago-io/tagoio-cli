import { Device, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { confirmPrompt } from "../../prompt/confirm.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";
import { getDeviceForSending } from "./device-sender.js";

interface IOptions {
  to: string;
  from: string;
  environment: string;
  amount: number;
}

type DeviceRegion = ConstructorParameters<typeof Device>[0]["region"];

/** Resolves a device id from an id (24-char) or a device token. */
async function resolveDeviceID(idOrToken: string, region: DeviceRegion) {
  if (idOrToken.length === 24) {
    return idOrToken;
  }
  const info = await new Device({ token: idOrToken, region }).info().catch(errorHandler);
  return info?.id;
}

async function startCopy(resources: Resources, deviceTo: Device, fromID: string, options: IOptions) {
  const { amount } = options;

  const dataStream = resources.devices.getDeviceDataStreaming(fromID, {}, { poolingRecordQty: 2000, poolingTime: 400, neverStop: false });

  let total = 0;
  for await (let data of dataStream) {
    data = data.filter((x) => x.variable !== "payload");
    total += data.length;
    // Write through the destination device token: profile tokens cannot send data.
    await deviceTo.sendData(data);
    if (total >= amount) {
      break;
    }
  }

  successMSG(`> Data transfer completed. A total of ${total} registers were copied.`);
}

async function copyDeviceData(options: IOptions) {
  printScopeBanner(resolveScope());

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  if (!options.from || !options.to) {
    options.from = await pickDeviceIDFromTagoIO(resources, "Choose a device to copy the data from:");
    options.to = await pickDeviceIDFromTagoIO(resources, "Choose a device to copy the data to: ");
  }

  const fromID = await resolveDeviceID(options.from, config.profileRegion);
  const toID = await resolveDeviceID(options.to, config.profileRegion);
  if (!fromID || !toID) {
    return errorHandler("Device not found");
  }

  const deviceFromInfo = await resources.devices.info(fromID).catch(errorHandler);
  const deviceToInfo = await resources.devices.info(toID).catch(errorHandler);
  if (!deviceToInfo || !deviceFromInfo) {
    return errorHandler("Device not found");
  }

  const yesNo = await confirmPrompt(`Copy data from ${highlightMSG(deviceFromInfo.name)} to ${highlightMSG(deviceToInfo.name)}?`);
  if (!yesNo) {
    return;
  }

  const deviceTo = await getDeviceForSending(resources, toID, config.profileRegion);

  infoMSG(`> Copying data from ${highlightMSG(deviceFromInfo.name)} to ${highlightMSG(deviceToInfo.name)}...`);
  await startCopy(resources, deviceTo, fromID, options);
}

export { copyDeviceData };
