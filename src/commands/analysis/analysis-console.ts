import { Account } from "@tago-io/sdk";
import { connect } from "socket.io-client";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";

function apiSocket(profileToken: string) {
  const socket = connect("wss://realtime.tago.io", {
    reconnectionDelay: 10_000,
    reconnection: true,
    transports: ["websocket"],
    query: {
      token: profileToken,
    },
  });

  return socket;
}

async function connectAnalysisConsole(scriptName: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const scriptList = Object.keys(config.analysisIDList);
  const scriptKey = scriptList.find((key) => key.toLowerCase().includes(scriptName.toLowerCase()));

  if (!scriptKey) {
    errorHandler(`Analysis not found: ${scriptName}`);
    return process.exit();
  }

  const account = new Account({ token: config.profileToken });
  const analysis_info = await account.analysis.info(config.analysisIDList[scriptKey]).catch(() => null);
  if (!analysis_info) {
    errorHandler(`Analysis with ID: ${config.analysisIDList[scriptKey]} couldn't be found.`);
    return process.exit();
  }

  const socket = apiSocket(config.profileToken);
  socket.on("connect", () => {
    infoMSG("Connected to TagoIO, Getting analysis information...");
    socket.emit("attach", "analysis", config.analysisIDList[scriptKey]);
    socket.emit("attach", {
      resourceName: "analysis",
      resourceID: config.analysisIDList[scriptKey],
    });
  });

  socket.on("disconnect", () => console.info("Disconnected from TagoIO.\n\n"));

  socket.on("error", (e: Error) => {
    errorHandler("Connection error");
    console.error(e);
  });

  socket.on("ready", () => successMSG(`Analysis [${highlightMSG(analysis_info.name)}] found succesfully. ${highlightMSG("Waiting for logs...")}`));

  socket.on("analysis::console", (scope: any) => {
    console.log(`\x1b[35m${new Date(scope.timestamp).toISOString()} \x1b[0m ${scope.message}`);
  });
}

export { connectAnalysisConsole };
