import { Account, Device } from "@tago-io/sdk";
import { DeviceInfo } from "@tago-io/sdk/out/modules/Account/devices.types";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";

async function deviceInfo(idOrToken: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });
  if (!idOrToken) {
    console.error("You must provide a device ID or Token");
    return process.exit();
  }
  let device_info = await account.devices.info(idOrToken).catch(() => null);
  if (!device_info) {
    const device = new Device({ token: idOrToken });
    device_info = await device
      .info()
      .then((r) => r as DeviceInfo)
      .catch(() => null);

    if (!device_info) {
      console.error(`Device with ID/token: ${idOrToken} couldn't be found.`);
      return process.exit();
    }

    idOrToken = device_info.id;
  }

  infoMSG(`Device Found: ${device_info.name} [${device_info.id}].`);
  successMSG(device_info);
  const paramList = await account.devices.paramList(idOrToken);
  infoMSG(paramList.map((x) => ({ [x.key]: x.value })));
}

export { deviceInfo };
