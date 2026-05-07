import { Account } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";
import { promptTextToEnter } from "../../prompt/text-prompt.js";

interface BucketSettings {
  network: string;
  connector: string;
}

type environmentConfigResponse = NonNullable<ReturnType<typeof getEnvironmentConfig>>;

function _formatUpdateMessage(deviceID: string, serialNumbers: (string | undefined)[], network: string, connector: string) {
  const serials = serialNumbers.filter((s): s is string => Boolean(s));
  const serialPart = serials.length > 0 ? ` serial=${kleur.cyan(serials.join(","))}` : "";
  return `Device network and connector updated. device=${kleur.blue(deviceID)}${serialPart} network=${kleur.cyan(network)} connector=${kleur.cyan(connector)}`;
}

async function updateDevice(config: environmentConfigResponse, deviceID: string, settings: BucketSettings) {
  const account = new Account({ token: config.profileToken, region: config.profileRegion });

  const tokens = await account.devices.tokenList(deviceID, { fields: ["name", "token", "permission", "serie_number"] });
  const tokenList = tokens.map((token) => token.token);

  if (tokenList) {
    for (const token of tokenList) {
      await account.devices.tokenDelete(token);
    }
  }

  await account.devices.edit(deviceID, { network: settings.network, connector: settings.connector, active: true });

  const serialNumbers: (string | undefined)[] = [];
  for (const token of tokens) {
    const serieNumber = token.serie_number as string | undefined;
    serialNumbers.push(serieNumber);
    await account.devices.tokenCreate(deviceID, { serie_number: serieNumber, name: token.name, permission: "full" });
  }

  successMSG(_formatUpdateMessage(deviceID, serialNumbers, settings.network, settings.connector));
}

async function changeNetworkOrConnector(id: string, options: { environment: string; networkID: string; connectorID: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }

  let { networkID, connectorID } = options;

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  const deviceID = id || (await pickDeviceIDFromTagoIO(account));
  if (!deviceID) {
    return;
  }

  const deviceInfo = await account.devices.info(deviceID).catch(errorHandler);
  if (!deviceInfo) {
    return;
  }

  infoMSG(`Device: ${deviceInfo.name} - ${kleur.blue(deviceID)}`);

  if (!networkID) {
    networkID = await promptTextToEnter("Enter the network ID");
  }

  if (!connectorID) {
    connectorID = await promptTextToEnter("Enter the connector ID");
  }

  if (!networkID && !connectorID) {
    errorHandler("Network or Connector ID is required");
  }

  if (networkID === deviceInfo.network && connectorID === deviceInfo.connector) {
    errorHandler("Network and Connector are already set to this device");
  }

  const updateInfo = {
    network: networkID || deviceInfo.network,
    connector: connectorID || deviceInfo.connector,
  };

  await updateDevice(config, deviceID, updateInfo);
}

export { changeNetworkOrConnector, _formatUpdateMessage };
