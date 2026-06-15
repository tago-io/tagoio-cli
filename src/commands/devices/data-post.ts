import { Account, Device, Utils } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  post: string;
}

async function postDeviceData(idOrToken: string, options: IOptions) {
  printScopeBanner(resolveScope());

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
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

  const data = JSON.parse(options.post);
  const device = await Utils.getDevice(account, deviceInfo.id);
  await device.sendData(data).then(successMSG).catch(errorHandler);
}

export { postDeviceData };
