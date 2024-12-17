import { Account, Device, Utils } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";

interface IOptions {
  environment?: string;
  post: string;
}

async function postDeviceData(idOrToken: string, options: IOptions) {
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
      const device = new Device({ token: idOrToken, region: !process.env.TAGOIO_API ? "usa-1" : "env" });
      return device.info();
    })
    .catch(errorHandler);

  if (!deviceInfo) {
    return;
  }

  const data = JSON.parse(options.post);
  const device = await Utils.getDevice(account, deviceInfo.id);
  await device.sendData(data).then(successMSG).catch(errorHandler);
}

export { postDeviceData };
