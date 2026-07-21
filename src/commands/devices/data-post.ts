import { Device, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";
import { getDeviceForSending } from "./device-sender.js";

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

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(resources);
  }
  const deviceInfo = await resources.devices
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
  // Send through a device token: profile tokens cannot write device data.
  const device = await getDeviceForSending(resources, deviceInfo.id, config.profileRegion);
  await device.sendData(data).then(successMSG).catch(errorHandler);
}

export { postDeviceData };
