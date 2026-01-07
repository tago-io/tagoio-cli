import { Account, AnalysisInfo } from "@tago-io/sdk";
import { EventSource } from "eventsource";
import { getEnvironmentConfig, IEnvironment } from "../../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";

/**
 * Creates a new SSE connection to the TagoIO Realtime API.
 * @param profileToken - The user's profile token.
 * @param analysisID - The ID of the analysis script to connect to.
 * @param urlSSERealtime - The URL of the TagoIO SSE Realtime API.
 * @returns An EventSource instance connected to the TagoIO Realtime API.
 */
function apiSSE(profileToken: string, analysisID: string, urlSSERealtime?: string) {
  const url = urlSSERealtime || "https://sse.tago.io/events";
  const sse = new EventSource(`${url}?channel=analysis_console.${analysisID}&token=${profileToken}`);

  return sse;
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
      analysisList.map((x) => ({ names: [x.name, x.fileName], value: x })),
    );
  } else {
    scriptObj = await pickAnalysisFromConfig(analysisList);
  }
  return scriptObj;
}

/**
 * Sets up the SSE connection and event listeners for device live inspection.
 * @param sse - The SSE connection to TagoIO.
 * @param deviceIdOrToken - The ID or token of the device to inspect.
 * @param deviceInfo - Information about the device being inspected.
 */
function setupSSE(sse: ReturnType<typeof apiSSE>, _script_id: string, analysis_info: AnalysisInfo) {
  sse.onmessage = (event) => {
    const scope = JSON.parse(event.data).payload;
    console.log(`\x1b[35m${new Date(scope.timestamp).toISOString()} \x1b[0m ${scope.message}`);
  };

  sse.onerror = (error) => {
    errorHandler("Connection error");
    console.error(error);
  };

  sse.onopen = () => {
    infoMSG("Connected to TagoIO, Getting analysis information...");
    successMSG(`Analysis [${highlightMSG(analysis_info.name)}] found successfully.`);
    successMSG(`Waiting for logs...`);
  };
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

  const sse = apiSSE(config.profileToken, analysis_info.id, config?.tagoSSEURL);
  setupSSE(sse, scriptObj.id, analysis_info);
}

export { connectAnalysisConsole };
