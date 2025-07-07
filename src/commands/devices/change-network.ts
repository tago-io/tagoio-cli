import axios from "axios";
import kleur from "kleur";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";
import { promptTextToEnter } from "../../prompt/text-prompt";

interface BucketSettings {
  network: string;
  connector: string;
}

type environmentConfigResponse = NonNullable<ReturnType<typeof getEnvironmentConfig>>;


async function updateDevice(config: environmentConfigResponse, deviceID: string, settings: BucketSettings) {
  const account = new Account({ token: config.profileToken, region: config.profileRegion });

  const tokens = await account.devices.tokenList(deviceID);
  const tokenList = tokens.map((token) => token.token);

  if (tokenList) {
    for (const token of tokenList) {
      await account.devices.tokenDelete(token);
    }
  }

  await account.devices.edit(deviceID, { network: settings.network, connector: settings.connector, active: true });

  for (const token of tokens) {
    const serieNumber = token.serie_number as string | undefined;
    await account.devices.tokenCreate(deviceID, { serie_number: serieNumber, name: token.name, permission: "full" });
  }

  successMSG(`Device ${kleur.blue(deviceID)} has been successfully updated to use the ${kleur.cyan(settings.network)} network along with the ${kleur.cyan(settings.connector)} connector.`);
}

async function changeNetworkOrConnector(id: string, options: { environment: string; networkID: string; connectorID: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
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

  infoMSG(`> ${deviceInfo.name} - ${kleur.blue(deviceID)}\n`);

  if (!networkID) {
    networkID = await promptTextToEnter("Enter the network ID");
  }

  if (!connectorID) {
    connectorID = await promptTextToEnter("Enter the connector ID");
  }

  if (!networkID && !connectorID) {
    errorHandler("Network or Connector ID is required");
    return;
  }

  if (networkID === deviceInfo.network && connectorID === deviceInfo.connector) {
    errorHandler("Network and Connector are already set to this device");
    return;
  }

  const updateInfo = {
    network: networkID || deviceInfo.network,
    connector: connectorID || deviceInfo.connector,
  };

  await updateDevice(config, deviceID, updateInfo);
}

export { changeNetworkOrConnector }
