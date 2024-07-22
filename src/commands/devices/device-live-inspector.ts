import { io } from "socket.io-client";

import { Account, Device } from "@tago-io/sdk";
import { DeviceInfo } from "@tago-io/sdk/lib/types";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio";

/**
 * Creates a new socket connection to the TagoIO Realtime API.
 * @param profileToken - The user's profile token.
 * @returns A socket instance connected to the TagoIO Realtime API.
 */
function apiSocket(profileToken: string) {
  const socket = io("wss://realtime.tago.io", {
    reconnectionDelay: 10_000,
    reconnection: true,
    transports: ["websocket"],
    query: {
      token: profileToken,
    },
  });

  return socket;
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
 * Sets up the socket connection and event listeners for device live inspection.
 * @param socket - The socket connection to TagoIO.
 * @param deviceIdOrToken - The ID or token of the device to inspect.
 * @param deviceInfo - Information about the device being inspected.
 */
function setupSocket(socket: ReturnType<typeof apiSocket>, deviceIdOrToken: string, deviceInfo: DeviceInfo) {
  socket.on("connect", () => {
    successMSG("Connected to TagoIO, Getting device information...");
    socket.emit("attach", "device", deviceIdOrToken);
    socket.emit("attach", {
      resourceName: "device",
      resourceID: deviceIdOrToken,
    });
  });

  socket.on("disconnect", () => infoMSG("Disconnected from TagoIO.\n\n"));

  socket.on("error", (e: Error) => errorHandler(`Connection error: ${e}`));

  socket.on("ready", () => {
    const deviceName = deviceInfo?.name || deviceIdOrToken;
    successMSG(`Device [${highlightMSG(deviceName)}] found successfully.`);
    successMSG(`Waiting for logs...`);
  });

  /**
   * Event listener for device inspection messages.
   */
  socket.on("device::inspection", (scope: ScopeContent | ScopeContent[]) => {
    if (Array.isArray(scope)) {
      for (const item of scope) {
        displayMessage(item);
      }
    } else {
      displayMessage(scope);
    }
  });
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
      .then((r) => r as unknown as DeviceInfo)
      .catch(() => null);

    if (!deviceInfo) {
      errorHandler(`Device with ID/Token: ${deviceIdOrToken} couldn't be found.`);
      return process.exit(0);
    }

    deviceIdOrToken = deviceInfo.id;
  }

  const socket = apiSocket(config.profileToken);
  setupSocket(socket, deviceIdOrToken, deviceInfo);
}

export { inspectorConnection };
