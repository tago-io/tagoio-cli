import { Account, Device } from "@tago-io/sdk";
import { DeviceInfo } from "@tago-io/sdk/out/modules/Account/devices.types";
import { io } from "socket.io-client";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";
import { getDeviceIDFromPrompt } from "./device-info";

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

interface IOptions {
  environment: string;
  postOnly: boolean;
  getOnly: boolean;
}
interface ScopeContent {
  timestamp: string;
  title: string;
  content: string;
}

function displayMessage(scope: ScopeContent) {
  // if (getOnly && !scope.title.includes("GET")) {
  //   return;
  // }

  // if (postOnly && !scope.title.includes("POST")) {
  //   return;
  // }

  if (scope.title.includes("Request") || scope.title.includes("MQTT")) {
    console.log("--------------");
  }

  const content = typeof scope.content === "object" ? JSON.stringify(scope.content) : scope.content;
  console.log(`${highlightMSG(new Date(scope.timestamp).toISOString())} \x1b[32m${scope.title}\x1b[0m ${content}`);
}

async function inspectorConnection(deviceIdOrToken: string, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });
  if (!deviceIdOrToken) {
    deviceIdOrToken = await getDeviceIDFromPrompt(account);
  }

  let device_info = await account.devices.info(deviceIdOrToken).catch(() => null);
  if (!device_info) {
    const device = new Device({ token: deviceIdOrToken });
    device_info = await device
      .info()
      .then((r) => r as DeviceInfo)
      .catch(() => null);

    if (!device_info) {
      errorHandler(`Device with ID/token: ${deviceIdOrToken} couldn't be found.`);
      return process.exit();
    }

    deviceIdOrToken = device_info.id;
  }

  const socket = apiSocket(config.profileToken);
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

  socket.on("ready", () => successMSG(`Device [${highlightMSG(device_info?.name)}] found succesfully. ${highlightMSG("Waiting for logs...")}`));

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

export { inspectorConnection };
