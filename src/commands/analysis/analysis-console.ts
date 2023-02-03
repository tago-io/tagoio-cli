import { Account } from "@tago-io/sdk";
import { connect } from "socket.io-client";
import { getEnvironmentConfig, IEnvironment } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";

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

async function connectAnalysisConsole(scriptName: string | void, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }
  let scriptObj: IEnvironment["analysisList"][0] | undefined;
  if (scriptName) {
    scriptObj = searchName(
      scriptName,
      config.analysisList.map((x) => ({ names: [x.name, x.fileName], value: x }))
    );
  } else {
    scriptObj = await pickAnalysisFromConfig(config.analysisList);
  }

  if (!scriptObj) {
    errorHandler(`Analysis not found: ${scriptName}`);
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  const analysis_info = await account.analysis.info(scriptObj.id).catch(() => null);
  if (!analysis_info) {
    errorHandler(`Analysis with ID: ${scriptObj.id} couldn't be found.`);
    return;
  }

  const socket = apiSocket(config.profileToken);
  socket.on("connect", () => {
    infoMSG("Connected to TagoIO, Getting analysis information...");
    socket.emit("attach", "analysis", scriptObj?.id);
    socket.emit("attach", {
      resourceName: "analysis",
      resourceID: scriptObj?.id,
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
