import { Account } from "@tago-io/sdk";
import { replaceObj } from "../../../../lib/replace-obj";
import { IExportHolder } from "../types";

async function actionsExport(account: Account, import_account: Account, export_holder: IExportHolder) {
  console.info("Exporting actions: started");

  // @ts-expect-error we are looking only for keys
  const list = await account.actions.list({ amount: 99, fields: ["id", "name", "tags"], filter: { tags: [{ key: "export_id" }] } });
  // @ts-expect-error we are looking only for keys
  const import_list = await import_account.actions.list({ amount: 99, fields: ["id", "tags"], filter: { tags: [{ key: "export_id" }] } });

  for (const { id: action_id, name } of list) {
    console.info(`Exporting action ${name}`);
    const action = await account.actions.info(action_id);
    const export_id = action.tags?.find((tag) => tag.key === "export_id")?.value;

    let { id: target_id } = import_list.find((action) => action.tags?.find((tag) => tag.key === "export_id" && tag.value == export_id)) || { id: null };

    const new_action = replaceObj(action, { ...export_holder.devices, ...export_holder.analysis });
    for (const trigger of new_action.trigger) {
      if (!trigger.value) {
        delete trigger.value;
      }
      if (!trigger.second_value) {
        delete trigger.second_value;
      }
      if (trigger.tag_key) {
        delete trigger.unlock;
      }
    }

    if (!target_id) {
      ({ action: target_id } = await import_account.actions.create(new_action));
    } else {
      await import_account.actions.edit(target_id, new_action);
    }
  }

  console.info("Exporting actions: finished");
  return export_holder;
}

export { actionsExport };
