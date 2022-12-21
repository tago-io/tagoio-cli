import zlib from "zlib";
import { Account } from "@tago-io/sdk";
import axios from "axios";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";

async function duplicateAnalysis(analysisID: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });

  const analysis = await account.analysis.info(analysisID).catch(() => null);
  if (!analysis) {
    throw errorHandler(`Analysis ID ${analysisID} can't be found`);
  }

  const script = await account.analysis.downloadScript(analysis.id);
  const script_base64 = await axios
    .get(script.url, {
      responseType: "arraybuffer",
    })
    .then((response) => zlib.gunzipSync(response.data).toString("base64"));

  const new_analysis_name = `${analysis.name} - Copy`;
  const { id: new_analysis_id } = await account.analysis.create({
    ...analysis,
    name: `${analysis.name} - Copy`,
  });
  await account.analysis.uploadScript(new_analysis_id, {
    content: script_base64,
    language: analysis.runtime || "node",
    name: "script.js",
  });

  successMSG(`Analysis succesfully duplicated: ${new_analysis_name}`);
}

export { duplicateAnalysis };
