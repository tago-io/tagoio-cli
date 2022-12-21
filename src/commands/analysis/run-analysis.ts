import { spawn, SpawnOptions } from "child_process";
import { Account } from "@tago-io/sdk";
import { getEnvironmentConfig } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages";

async function runAnalysis(scriptName: string, options: { environment: string; debug: boolean; clear: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  scriptName = scriptName.toLowerCase();

  const scriptList = Object.keys(config.analysisIDList);
  const scriptToRunName = scriptList.find((key) => key.toLowerCase().includes(scriptName));
  // const scriptToRunName = scriptList.find((key) => cmd.find((x) => key.toLowerCase().includes(x)));
  if (!scriptToRunName) {
    errorHandler(`Analysis couldnt be found in your environment: ${scriptName}`);
    return process.exit();
  }

  const analysisID = config.analysisIDList[scriptToRunName];
  if (!analysisID) {
    return errorHandler(`> Analysis not found: ${scriptToRunName}.`);
  }

  const account = new Account({ token: config.profileToken });

  const { token: analysisToken } = await account.analysis.info(analysisID);
  successMSG(`> Analysis found: ${highlightMSG(scriptToRunName)} [${highlightMSG(analysisToken)}].`);

  const spawnOptions: SpawnOptions = {
    shell: true,
    cwd: getCurrentFolder(),
    stdio: "inherit",
    env: {
      ...process.env,
      T_EXTERNAL: "external",
      T_ANALYSIS_TOKEN: analysisToken,
      T_ANALYSIS_ID: analysisID,
    },
  };

  const scriptPath = `${config.analysisPath}/${scriptToRunName}`;
  let cmd = "ts-node-dev --quiet";
  if (options.debug) {
    cmd += " --inspect";
  }

  if (options.clear) {
    cmd += " --clear";
  }

  await account.analysis.edit(analysisID, { run_on: "external" });
  const spawnProccess = spawn(`${cmd} ${scriptPath}`, spawnOptions);
  spawnProccess.addListener("close", async () => {
    await account.analysis.edit(analysisID, { run_on: "tago" }).then(infoMSG);
  });
}
export { runAnalysis };
