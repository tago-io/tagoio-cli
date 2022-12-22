import { spawn, SpawnOptions } from "child_process";
import { Account } from "@tago-io/sdk";
import { getEnvironmentConfig } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, highlightMSG, successMSG } from "../../lib/messages";

async function runAnalysis(scriptName: string, options: { environment: string; debug: boolean; clear: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  scriptName = scriptName.toLowerCase();

  const scriptToRun = config.analysisList.find((x) => x.name.toLowerCase().includes(scriptName));
  // const scriptToRunName = scriptList.find((key) => cmd.find((x) => key.toLowerCase().includes(x)));
  if (!scriptToRun) {
    errorHandler(`Analysis couldnt be found in your environment: ${scriptName}`);
    return process.exit();
  }

  const account = new Account({ token: config.profileToken });

  const { token: analysisToken } = await account.analysis.info(scriptToRun.id);
  successMSG(`> Analysis found: ${highlightMSG(scriptToRun.fileName)} [${highlightMSG(analysisToken)}].`);

  const spawnOptions: SpawnOptions = {
    shell: true,
    cwd: getCurrentFolder(),
    stdio: "inherit",
    env: {
      ...process.env,
      T_EXTERNAL: "external",
      T_ANALYSIS_TOKEN: analysisToken,
      T_ANALYSIS_ID: scriptToRun.id,
    },
  };

  const scriptPath = `${config.analysisPath}/${scriptToRun.fileName}`;
  let cmd: string = "";
  if (scriptToRun.fileName.endsWith(".ts")) {
    cmd += "ts-node-dev --quiet";
  }
  if (scriptToRun.fileName.endsWith(".js")) {
    cmd += "node ";
  }

  if (!cmd) {
    errorHandler(`Couldn't run file ${scriptToRun.fileName}`);
    return;
  }

  if (options.clear) {
    cmd += " --clear";
  }
  if (options.debug) {
    cmd += " --inspect";
  }

  await account.analysis.edit(scriptToRun.id, { run_on: "external" });
  const spawnProccess = spawn(`${cmd} -- ${scriptPath}`, spawnOptions);

  const killAnalysis = async () => await account.analysis.edit(scriptToRun.id, { run_on: "tago" }).then(console.log);
  spawnProccess.on("close", killAnalysis);
  spawnProccess.on("SIGINT", killAnalysis);
}
export { runAnalysis };
