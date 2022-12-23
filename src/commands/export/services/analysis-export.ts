import zlib from "zlib";
import { Account } from "@tago-io/sdk";
import axios from "axios";
import { IExportHolder } from "../types";
import { infoMSG } from "../../../lib/messages";
import { replaceObj } from "../../../lib/replace-obj";

async function analysisExport(account: Account, import_account: Account, export_holder: IExportHolder) {
  infoMSG("Exporting analysis: started");

  // @ts-expect-error we are looking only for keys
  const list = await account.analysis.list({ amount: 99, fields: ["id", "name", "tags"], filter: { tags: [{ key: "export_id" }] } }).then((r) => r.reverse());
  // @ts-expect-error we are looking only for keys
  const import_list = await import_account.analysis.list({ amount: 99, fields: ["id", "tags"], filter: { tags: [{ key: "export_id" }] } });

  for (const { id: analysis_id, name } of list) {
    infoMSG(`Exporting dashboard ${name}...`);
    const analysis = await account.analysis.info(analysis_id);
    const export_id = analysis.tags?.find((tag) => tag.key === "export_id")?.value;

    let { id: target_id } = import_list.find((analysis) => analysis.tags?.find((tag) => tag.key === "export_id" && tag.value == export_id)) || { id: null };

    const new_analysis = replaceObj(analysis, { ...export_holder.devices, ...export_holder.tokens });
    if (!target_id) {
      ({ id: target_id } = await import_account.analysis.create(new_analysis));
    } else {
      await import_account.analysis.edit(target_id, {
        name: new_analysis.name,
        tags: new_analysis.tags,
        active: new_analysis.active,
        variables: new_analysis.variables,
      });
    }
    const script = await account.analysis.downloadScript(analysis_id);
    const script_base64 = await axios
      .get(script.url, {
        responseType: "arraybuffer",
      })
      .then((response) => zlib.gunzipSync(response.data).toString("base64"));

    await import_account.analysis.uploadScript(target_id, { content: script_base64, language: "node", name: "script.js" });

    export_holder.analysis[analysis_id] = target_id;
  }

  infoMSG("Exporting analysis: finished");
  return export_holder;
}

export { analysisExport };
