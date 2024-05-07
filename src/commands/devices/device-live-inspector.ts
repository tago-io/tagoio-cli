import EventSource from "eventsource";

import { Account, Device } from "@tago-io/sdk";
import { DeviceInfo } from "@tago-io/sdk/lib/types";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, highlightMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";

/**
 * Creates a new SSE connection to the TagoIO Realtime API.
 * @param profileToken - The user's profile token.
 * @returns An EventSource instance connected to the TagoIO Realtime API.
 */
function apiSSE(profileToken: string) {
  const sse = new EventSource(`https://realtime.tago.io?token=${profileToken}`);

  return sse;
}

interface ScopeContent {
  timestamp: string;
  title: string;
  content: string;
}

/**
 * Displays a message in the console based on the given scope content.
 * If the scope title includes "Request" or "MQTT", a separator line is printed before the message.
 * @param {ScopeContent} scope - The scope content to be displayed.
 * @returns {void}
 */
function displayMessage(scope: ScopeContent) {
  if (scope.title.includes("Request") || scope.title.includes("MQTT")) {
    console.log("--------------");
  }

  const content = typeof scope.content === "object" ? JSON.stringify(scope.content) : scope.content;
  console.log(`${highlightMSG(new Date(scope.timestamp).toISOString())} \x1b[32m${scope.title}\x1b[0m ${content}`);
}

/**
 * Sets up the SSE connection and event listeners for device live inspection.
 * @param sse - The SSE connection to TagoIO.
 * @param deviceIdOrToken - The ID or token of the device to inspect.
 * @param deviceInfo - Information about the device being inspected.
 */
function setupSSE(sse: ReturnType<typeof apiSSE>, deviceIdOrToken: string, deviceInfo: DeviceInfo) {
  sse.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.resourceName === "device" && data.resourceID === deviceIdOrToken) {
      if (Array.isArray(data.scope)) {
        for (const item of data.scope) {
          displayMessage(item);
        }
      } else {
        displayMessage(data.scope);
      }
    }
  };

  sse.onerror = (error) => errorHandler(`Connection error: ${JSON.stringify(error)}`);

  sse.onopen = () => {
    const deviceName = deviceInfo?.name || deviceIdOrToken;
    successMSG(`Device [${highlightMSG(deviceName)}] found successfully.`);
    successMSG(`Waiting for logs...`);
  };
}

interface IOptions {
  environment: string;
  postOnly: boolean;
  getOnly: boolean;
}

/**
 * Establishes a connection to the TagoIO Live Inspector for a device.
 * @param deviceIdOrToken - The ID or token of the device to connect to.
 * @param options - The options object containing the environment configuration.
 */
async function inspectorConnection(deviceIdOrToken: string, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  if (!deviceIdOrToken) {
    deviceIdOrToken = await pickDeviceIDFromTagoIO(account);
  }

  let deviceInfo = await account.devices.info(deviceIdOrToken).catch(() => null);
  if (!deviceInfo) {
    const device = new Device({ token: deviceIdOrToken, region: "usa-1" });
    deviceInfo = await device
      .info()
      .then((r) => r as DeviceInfo)
      .catch(() => null);

    if (!deviceInfo) {
      errorHandler(`Device with ID/Token: ${deviceIdOrToken} couldn't be found.`);
      return process.exit(0);
    }

    deviceIdOrToken = deviceInfo.id;
  }

  const sse = apiSSE(config.profileToken);
  setupSSE(sse, deviceIdOrToken, deviceInfo);
}

export { inspectorConnection };
