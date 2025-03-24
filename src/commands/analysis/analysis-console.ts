import { connect } from "socket.io-client";

import { Account } from "@tago-io/sdk";

import { IEnvironment, getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";

/**
 * Creates a WebSocket connection to the TagoIO Realtime API.
 * @param profileToken The user's profile token.
 * @returns The WebSocket instance.
 */
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

/**
 * Returns the script object from the analysis list based on the script name or prompts the user to select one.
 * @param scriptName - The name of the script to search for.
 * @param analysisList - The list of analysis objects to search through.
 * @returns The script object that matches the script name or the one selected by the user.
 */
async function getScriptObj(scriptName: string | void, analysisList: IEnvironment["analysisList"]) {
  let scriptObj: IEnvironment["analysisList"][0] | undefined;
  if (scriptName) {
    scriptObj = searchName(
      scriptName,
      analysisList.map((x) => ({ names: [x.name, x.fileName], value: x }))
    );
  } else {
    scriptObj = await pickAnalysisFromConfig(analysisList);
  }
  return scriptObj;
}
/**
 * Sets up a socket connection to TagoIO and attaches to an analysis script.
 * @param socket - The socket connection to TagoIO.
 * @param scriptId - The ID of the analysis script to attach to.
 * @param analysis_info - Information about the analysis script.
 */
function setupSocket(socket: ReturnType<typeof apiSocket>, scriptId: string, analysis_info: any) {
  socket.on("connect", () => {
    infoMSG("Connected to TagoIO, Getting analysis information...");
    socket.emit("attach", "analysis", scriptId);
    socket.emit("attach", {
      resourceName: "analysis",
      resourceID: scriptId,
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

/**
 * Connects to the analysis console for a given script name and environment.
 * @param scriptName - The name of the script to connect to.
 * @param options - The options object containing the environment to connect to.
 * @returns void
 */
async function connectAnalysisConsole(scriptName: string | void, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const scriptObj = await getScriptObj(scriptName, config.analysisList);
  if (!scriptObj) {
    errorHandler(`Analysis not found: ${scriptName}`);
    return;
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  const analysis_info = await account.analysis.info(scriptObj.id).catch(() => null);
  if (!analysis_info) {
    errorHandler(`Analysis with ID: ${scriptObj.id} couldn't be found.`);
    return;
  }

  const socket = apiSocket(config.profileToken);
  setupSocket(socket, scriptObj.id, analysis_info);
}

export { connectAnalysisConsole };
