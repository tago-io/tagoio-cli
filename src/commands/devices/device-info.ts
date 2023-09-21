import { Account, Device } from "@tago-io/sdk";
import { DeviceInfo } from "@tago-io/sdk/lib/types";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";
import { mapDate, mapTags } from "./device-list";

async function deviceInfo(idOrToken: string, options: { environment: string; raw: boolean; json: boolean; tokens: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(account);
  }
  let deviceInfo = await account.devices.info(idOrToken).catch(() => null);
  if (!deviceInfo) {
    const device = new Device({ token: idOrToken });
    deviceInfo = await device
      .info()
      .then((r) => r as DeviceInfo)
      .catch(() => null);

    if (!deviceInfo) {
      console.error(`Device with ID/token: ${idOrToken} couldn't be found.`);
      return process.exit();
    }

    idOrToken = deviceInfo.id;
  }

  infoMSG(`Device Found: ${deviceInfo.name} [${deviceInfo.id}].`);
  const paramList = await account.devices.paramList(idOrToken);

  if (options.tokens) {
    const tokenList = await account.devices.tokenList(idOrToken, { fields: ["name", "token", "last_authorization", "serie_number"] });
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
    console.dir(
      {
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
      },
      { depth: null }
    );
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
