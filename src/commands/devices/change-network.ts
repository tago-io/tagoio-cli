import { Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";
import { promptTextToEnter } from "../../prompt/text-prompt.js";

interface BucketSettings {
  network: string;
  connector: string;
}

interface DeviceToken {
  token: string;
  name: string;
  serie_number?: string;
}

type environmentConfigResponse = NonNullable<ReturnType<typeof getEnvironmentConfig>>;

function _formatUpdateMessage(deviceID: string, serialNumbers: (string | undefined)[], network: string, connector: string) {
  const serials = serialNumbers.filter((s): s is string => Boolean(s));
  const serialPart = serials.length > 0 ? ` serial=${kleur.cyan(serials.join(","))}` : "";
  return `Device network and connector updated. device=${kleur.blue(deviceID)}${serialPart} network=${kleur.cyan(network)} connector=${kleur.cyan(connector)}`;
}

/**
 * Validates that the target network and connector exist before any destructive
 * step. The TagoIO API rejects a network/connector change while the device
 * still has tokens, so the change requires deleting every token first. By
 * validating up front, an invalid id fails cleanly without ever deleting a
 * token — covering the common failure (bad connector) instead of relying on a
 * rollback after the damage is done.
 */
async function validateNetworkAndConnector(resources: Resources, network: string, connector: string) {
  await resources.integration.networks.info(network).catch(() => {
    errorHandler(`Invalid network: ${network} could not be found.`);
  });
  await resources.integration.connectors.info(connector).catch(() => {
    errorHandler(`Invalid connector: ${connector} could not be found.`);
  });
}

/** Describes a token for the manual-recreate hint: name plus serial when present. */
function describeToken(token: DeviceToken) {
  return `${token.name}${token.serie_number ? ` (serial ${token.serie_number})` : ""}`;
}

/**
 * Recreates the previously deleted tokens, preserving each token's name and
 * serial number. Runs in a `finally` so the device is never left tokenless,
 * even when the edit fails. Every token is attempted (one failure does not skip
 * the rest); if any fail to recreate, the error lists ONLY those so the user
 * doesn't recreate tokens that already came back.
 */
async function recreateTokens(resources: Resources, deviceID: string, tokens: DeviceToken[]) {
  const failed: DeviceToken[] = [];
  for (const token of tokens) {
    await resources.devices
      .tokenCreate(deviceID, { serie_number: token.serie_number, name: token.name, permission: "full" })
      .catch(() => failed.push(token));
  }

  if (failed.length > 0) {
    const lost = failed.map(describeToken).join(", ");
    errorHandler(
      `Failed to recreate device tokens after the network change. Recreate them manually: ${lost}. ` +
        `Use: tagoio device-token ${deviceID} --create "<name>"`,
    );
  }
}

async function updateDevice(config: environmentConfigResponse, deviceID: string, settings: BucketSettings) {
  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // Validate the target network/connector BEFORE touching tokens. A bad id
  // fails here, leaving the device's tokens untouched.
  await validateNetworkAndConnector(resources, settings.network, settings.connector);

  const tokens = (await resources.devices.tokenList(deviceID, {
    fields: ["name", "token", "permission", "serie_number"],
  })) as DeviceToken[];

  for (const token of tokens) {
    await resources.devices.tokenDelete(token.token);
  }

  // Call edit directly (not via applyDeviceEdit) and capture the error instead
  // of letting it exit the process: the tokens were just deleted, so they MUST
  // be recreated before we surface any edit failure. A `finally` would not be
  // enough here — applyDeviceEdit/errorHandler call process.exit(1), which
  // skips finally blocks entirely and would leave the device tokenless.
  const editError = await resources.devices
    .edit(deviceID, { network: settings.network, connector: settings.connector, active: true })
    .then(() => undefined)
    .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

  // Recreate tokens first, regardless of whether the edit succeeded.
  await recreateTokens(resources, deviceID, tokens);

  if (editError) {
    errorHandler(`Failed to change network/connector for device ${deviceID}: ${editError}`);
  }

  const serialNumbers = tokens.map((token) => token.serie_number);
  successMSG(_formatUpdateMessage(deviceID, serialNumbers, settings.network, settings.connector));
}

async function changeNetworkOrConnector(id: string, options: { environment: string; networkID: string; connectorID: string }) {
  printScopeBanner(resolveScope());

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }

  let { networkID, connectorID } = options;

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const deviceID = id || (await pickDeviceIDFromTagoIO(resources));
  if (!deviceID) {
    return;
  }

  const deviceInfo = await resources.devices.info(deviceID).catch(errorHandler);
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
