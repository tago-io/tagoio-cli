import kleur from "kleur";

import { Account, Device, Utils } from "@tago-io/sdk";
import { Data, DataQuery } from "@tago-io/sdk/lib/types";

// import { DataQuery } from "@tago-io/sdk/lib/types";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";
import { postDeviceData } from "./data-post";

async function getDevice(idOrToken: string, account: Account) {
  if (idOrToken.length === 36) {
    const device = new Device({ token: idOrToken });
    const info = await device.info().catch(errorHandler);
    if (!info) {
      return;
    }
    return {
      device,
      info,
    };
  }

  const info = await account.devices.info(idOrToken).catch(errorHandler);
  if (!info) {
    return;
  }

  const device = await Utils.getDevice(account, info.id).catch(errorHandler);
  if (!device) {
    return;
  }

  return {
    device,
    info,
  };
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
  const account = new Account({ token: config.profileToken, region: "usa-1" });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(account);
  }
  const deviceResult = await getDevice(idOrToken, account).catch(errorHandler);
  if (!deviceResult) {
    return;
  }

  const { device, info: deviceInfo } = deviceResult;

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
  infoMSG(`Query Filter: ${kleur.cyan(JSON.stringify(filter))}`);
  const dataList = await device
    .getData(filter)
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

export { getDeviceData };
