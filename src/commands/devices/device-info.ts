import { Device, DeviceInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";
import { mapDate, mapTags } from "./device-list.js";

async function deviceInfo(idOrToken: string, options: { environment: string; raw: boolean; json: boolean; tokens: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(resources);
  }
  let deviceInfo = await resources.devices.info(idOrToken).catch(() => null);
  if (!deviceInfo) {
    const device = new Device({ token: idOrToken });
    deviceInfo = await device
      .info()
      .then((r) => r as unknown as DeviceInfo)
      .catch(() => null);

    if (!deviceInfo) {
      errorHandler(`Device with ID/token: ${idOrToken} couldn't be found.`);
    }

    idOrToken = deviceInfo.id;
  }

  infoMSG(`Device Found: ${deviceInfo.name} [${deviceInfo.id}].`);
  const paramList = await resources.devices.paramList(idOrToken);

  if (options.tokens) {
    const tokenList = await resources.devices.tokenList(idOrToken, { fields: ["name", "token", "last_authorization", "serie_number"] });
    //@ts-expect-error ignore error
    deviceInfo.tokens = tokenList;
  }

  //@ts-expect-error ignore error
  delete deviceInfo.payload_decoder;
  //@ts-expect-error ignore error
  delete deviceInfo.bucket;
  //@ts-expect-error ignore error
  delete deviceInfo.description;
  deviceInfo.tags = mapTags(deviceInfo.tags, options);
  //@ts-expect-error ignore error
  deviceInfo.params = mapTags(paramList, options);

  if (options.json) {
    const payload = {
      // @ts-expect-error fix key ordering
      id: "",
      // @ts-expect-error fix key ordering
      name: "",
      // @ts-expect-error fix key ordering
      connector: "",
      // @ts-expect-error fix key ordering
      network: "",
      ...deviceInfo,
      created_at: mapDate(deviceInfo.created_at, options),
      last_input: mapDate(deviceInfo.last_input, options),
      updated_at: mapDate(deviceInfo.updated_at, options),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  console.table({
    name: deviceInfo.name,
    id: deviceInfo.id,
    connector: deviceInfo.connector,
    network: deviceInfo.network,
    active: deviceInfo.active,
    visible: deviceInfo.visible,
    type: deviceInfo.type,
    created_at: mapDate(deviceInfo.created_at, options),
    last_input: mapDate(deviceInfo.last_input, options),
    updated_at: mapDate(deviceInfo.updated_at, options),
  });
}

export { deviceInfo };
