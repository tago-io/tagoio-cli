import { Account, Device } from "@tago-io/sdk";
import { DataQuery } from "@tago-io/sdk/out/modules/Device/device.types";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";
import { postDeviceData } from "./data-post";

interface IOptions {
  environment?: string;
  variable?: string;
  group?: string;
  stringify: boolean;
  startDate: string;
  endDate: string;
  qty: string;
  post: string;
  json?: boolean;
}

async function getDeviceData(idOrToken: string, options: IOptions) {
  if (options.post) {
    await postDeviceData(idOrToken, options);
    return;
  }

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(account);
  }
  const deviceInfo = await account.devices
    .info(idOrToken)
    .catch(() => {
      const device = new Device({ token: idOrToken });
      return device.info();
    })
    .catch(errorHandler);

  if (!deviceInfo) {
    return;
  }

  const filter: DataQuery = {};
  if (options.variable) {
    filter.variables = options.variable;
  }
  if (options.group) {
    filter.groups = options.group;
  }
  if (options.startDate) {
    filter.start_date = options.startDate;
  }
  if (options.endDate) {
    filter.end_date = options.endDate;
  }
  if (options.qty) {
    filter.qty = Number(options.qty);
  }

  const dataList = await account.devices.getDeviceData(idOrToken, filter);

  infoMSG(`Device Found: ${deviceInfo.name} [${idOrToken}].`);
  if (options.stringify) {
    console.log(JSON.stringify(dataList));
  } else if (options.json) {
    console.dir(dataList, { depth: null });
  } else {
    console.table(dataList);
  }

  successMSG(`${dataList.length} data(s) found.`);
}

export { getDeviceData };
