import axios from "axios";
import prompts from "prompts";
import zlib from "zlib";

import { Account } from "@tago-io/sdk";
import { AnalysisListItem } from "@tago-io/sdk/lib/types";

import { infoMSG } from "../../../../lib/messages";
import { replaceObj } from "../../../../lib/replace-obj";
import { IExportHolder } from "../types";

/**
 * Choose one of the values for your Environment Variable
 */
async function choose_variable(key: string, values: string[]) {
  const choices: { title: string }[] = [];

  for (const value of values) {
    choices.push({ title: value });
  }

  const { variable } = await prompts({
    message: `Choice one value of Environment Variable - key "${key}":`,
    name: "variable",
    type: "autocomplete",
    choices,
  });

  return variable;
}

function separate_variable_with_duplicate_values(export_analysis: AnalysisListItem[], import_analysis: AnalysisListItem[]) {
  const values_by_keys: any = {};
  for (const item of [...export_analysis, ...import_analysis]) {
    if (!item.variables) {
      continue;
    }
    for (const variable of item.variables as unknown as { key: string; value: any }[]) {
      // eslint-disable-next-line no-prototype-builtins
      if (!(variable.key in values_by_keys)) {
        values_by_keys[variable.key] = [];
      }
      if (!values_by_keys[variable.key].includes(variable.value)) {
        values_by_keys[variable.key].push(variable.value);
      }
    }
  }

  return Object.keys(values_by_keys).map((key) => {
    if (values_by_keys[key].length > 1) {
      return { key: key, value: values_by_keys[key] };
    }
  });
}

async function fixEnvironmentVariables(
  import_account: Account,
  export_analysis: AnalysisListItem<"id" | "name" | "variables">[],
  import_analysis: AnalysisListItem<"id" | "name" | "variables">[],
  analysis_info: { id: string; variables: { key: string; value: string } }[]
) {
  const variables_with_duplicate_values = separate_variable_with_duplicate_values(export_analysis, import_analysis);

  for (const variable of variables_with_duplicate_values) {
    if (!variable) {
      continue;
    }
    const variable_value = await choose_variable(variable.key, variable.value);
    variable.value = variable_value;
  }

  for (const analyze_info of analysis_info) {
    for (const variable of variables_with_duplicate_values) {
      if (!variable) {
        continue;
      }
      (analyze_info.variables as unknown as { key: string; value: any }[]).find((data) => data.key === variable.key)!.value = variable.value;
    }
    await import_account.analysis.edit(analyze_info.id, {
      variables: analyze_info.variables,
    });
  }
}

async function analysisExport(account: Account, import_account: Account, export_holder: IExportHolder) {
  infoMSG("Exporting analysis: started");

  const list = await account.analysis
    // @ts-expect-error we are looking only for keys
    .list({ amount: 99, fields: ["id", "name", "tags", "variables"], filter: { tags: [{ key: "export_id" }] } })
    .then((r) => r.reverse());
  // @ts-expect-error we are looking only for keys
  const import_list = await import_account.analysis.list({ amount: 99, fields: ["id", "tags", "variables"], filter: { tags: [{ key: "export_id" }] } });

  const analysis_info = [];
  for (const { id: analysis_id, name } of list) {
    console.info(`Exporting analysis ${name}...`);
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
      analysis_info.push({ id: target_id, variables: new_analysis.variables });
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

  await fixEnvironmentVariables(import_account, list, import_list, analysis_info);

  infoMSG("Exporting analysis: finished");
  return export_holder;
}

export { analysisExport };
