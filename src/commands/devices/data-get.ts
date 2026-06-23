import { Data, DataQuery, Device, Resources } from "@tago-io/sdk";
import kleur from "kleur";
import prompts from "prompts";

// import { DataQuery } from "@tago-io/sdk";
import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";
import { postDeviceData } from "./data-post.js";

/**
 * Resolves a device's id and info from an ID or a device token. A 36-char input
 * is treated as a device token (resolved via a Device instance); anything else
 * is treated as a device id and looked up through the profile. Returns the
 * resolved id so callers can drive `resources.devices.*` operations by id.
 */
async function getDevice(idOrToken: string, resources: Resources) {
  let info;

  if (idOrToken.length === 36) {
    const device = new Device({ token: idOrToken });
    info = await device.info().catch(errorHandler);
  } else {
    info = await resources.devices.info(idOrToken).catch(errorHandler);
  }

  if (!info) {
    return;
  }

  return {
    id: info.id,
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
  delete?: boolean;
  empty?: boolean;
  yes?: boolean;
  query: "count" | "sum" | "avg" | "min" | "max" | "first" | "last";
}

/**
 * Deletes data from a device (mutable only). `--empty` clears all data and
 * confirms first unless `-y`/`--silent`; `--delete` removes data matching the
 * query filters. Operates by device id through `resources.devices`.
 */
async function deleteDeviceData(resources: Resources, deviceID: string, deviceInfo: { name: string }, options: IOptions) {
  if (options.empty && !options.yes) {
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Permanently delete ALL data from ${deviceInfo.name}? This cannot be undone.`,
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No data deleted.");
      return;
    }
  }

  const result = options.empty
    ? await resources.devices.emptyDeviceData(deviceID).catch((error) => errorHandler(error))
    : await resources.devices.deleteDeviceData(deviceID, _createDataFilter(options)).catch((error) => errorHandler(error));

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: deviceID, deleted: true, result })}\n`);
    return;
  }
  successMSG(`Data deleted from ${kleur.cyan(deviceInfo.name)}: ${kleur.dim(String(result))}`);
}

async function getDeviceData(idOrToken: string, options: IOptions) {
  // --delete/--empty/--post each take a different action on the same data; only
  // one may run per invocation.
  const ops = [Boolean(options.post), Boolean(options.delete), Boolean(options.empty)].filter(Boolean);
  if (ops.length > 1) {
    errorHandler("--post, --delete and --empty are mutually exclusive — pass only one.");
  }

  if (options.post) {
    await postDeviceData(idOrToken, options);
    return;
  }

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }
  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  if (!idOrToken) {
    idOrToken = await pickDeviceIDFromTagoIO(resources);
  }
  const deviceResult = await getDevice(idOrToken, resources).catch(errorHandler);
  if (!deviceResult) {
    return;
  }

  const { id: deviceID, info: deviceInfo } = deviceResult;

  if (options.delete || options.empty) {
    await deleteDeviceData(resources, deviceID, deviceInfo, options);
    return;
  }

  const filter = _createDataFilter(options);

  infoMSG(`Query Filter: ${kleur.cyan(JSON.stringify(filter))}`);
  const dataList = await resources.devices
    .getDeviceData(deviceID, filter)
    .then((r) => {
      return r.map((x) => {
        // @ts-expect-error ignore error
        delete x.device;
        return x;
      }) as Omit<Data, "device">[];
    })
    .catch((error) => {
      errorHandler(error);
    });

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(dataList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(dataList)}\n`);
  } else {
    console.table(dataList);
  }

  successMSG(`Device Found: ${kleur.cyan(deviceInfo.name)} - ${kleur.red((deviceInfo as any).type)} [${kleur.dim(idOrToken)}].`);
  successMSG(`${kleur.cyan(dataList.length)} data(s) found.`);
}

export { getDeviceData, _createDataFilter };
