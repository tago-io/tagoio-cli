import kleur from "kleur";

import { Account, Device, Utils } from "@tago-io/sdk";
import { Data, DataQuery } from "@tago-io/sdk/lib/types";

// import { DataQuery } from "@tago-io/sdk/lib/types";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";
import { postDeviceData } from "./data-post";

/**
 * Get device information and instance based on the provided ID or token.
 * @param {string} idOrToken - The ID or token of the device to retrieve.
 * @param {Account} account - The TagoIO account instance.
 * @returns {Promise<{device: Device, info: DeviceInfo}>} - A promise that resolves to an object containing the device instance and information.
 */
async function getDevice(idOrToken: string, account: Account) {
  let device;
  let info;

  if (idOrToken.length === 36) {
    device = new Device({ token: idOrToken });
    info = await device.info().catch(errorHandler);
  } else {
    info = await account.devices.info(idOrToken).catch(errorHandler);
    device = await Utils.getDevice(account, info?.id as string).catch(errorHandler);
  }

  if (!device || !info) {
    return;
  }

  return {
    device,
    info,
  };
}

/**
 * Creates a data filter object based on the provided options.
 * @param options - The options to create the data filter from.
 * @returns The data filter object.
 */
function _createDataFilter(options: IOptions): DataQuery {
  const filter: DataQuery = {};
  if (options.var) {
    filter.variables = options.var;
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
  if (options.query) {
    filter.query = options.query as any;
  }
  return filter;
}

interface IOptions {
  environment?: string;
  var?: string[];
  group?: string;
  stringify: boolean;
  startDate: string;
  endDate: string;
  qty: string;
  post: string;
  json?: boolean;
  query: "count" | "sum" | "avg" | "min" | "max" | "first" | "last";
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
  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(account);
  }
  const deviceResult = await getDevice(idOrToken, account).catch(errorHandler);
  if (!deviceResult) {
    return;
  }

  const { device, info: deviceInfo } = deviceResult;

  const filter = _createDataFilter(options);

  infoMSG(`Query Filter: ${kleur.cyan(JSON.stringify(filter))}`);
  const dataList = await device
    .getData(filter as any)
    .then((r) => {
      return r.map((x) => {
        // @ts-expect-error ignore error
        delete x.device;
        return x;
      }) as Omit<Data, "device">[];
    })
    .catch((error) => {
      errorHandler(error);
      throw error;
    });

  if (options.stringify) {
    console.log(JSON.stringify(dataList));
  } else if (options.json) {
    console.dir(dataList, { depth: null });
  } else {
    console.table(dataList);
  }

  successMSG(`Device Found: ${kleur.cyan(deviceInfo.name)} - ${kleur.red((deviceInfo as any).type)} [${kleur.dim(idOrToken)}].`);
  successMSG(`${kleur.cyan(dataList.length)} data(s) found.`);
}

export { getDeviceData, _createDataFilter };
