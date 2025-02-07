import { Account } from "@tago-io/sdk";

import { replaceObj } from "../../../../lib/replace-obj";
import { IExportHolder } from "../types";

async function accessExport(account: Account, import_account: Account, export_holder: IExportHolder) {
  console.info("Exporting access rules: started");

  // @ts-expect-error we are looking only for keys
  const list = await account.accessManagement.list({ amount: 99, fields: ["id", "name", "tags"], filter: { tags: [{ key: export_holder.config.export_tag }] } });
  // @ts-expect-error we are looking only for keys
  const import_list = await import_account.accessManagement.list({ amount: 99, fields: ["id", "tags"], filter: { tags: [{ key: export_holder.config.export_tag }] } });

  for (const { id: access_id, tags: access_tags, name } of list) {
    console.info(`Exporting access rule ${name}`);
    const access = await account.accessManagement.info(access_id);
    const export_id = access_tags?.find((tag) => tag.key === export_holder.config.export_tag)?.value;

    let { id: target_id } = import_list.find((access) => access.tags?.find((tag) => tag.key === export_holder.config.export_tag && tag.value == export_id)) || { id: null };

    const new_access = replaceObj(access, { ...export_holder.devices, ...export_holder.dashboards, ...export_holder.analysis });
    if (!target_id) {
      ({ am_id: target_id } = await import_account.accessManagement.create(new_access));
    } else {
      await import_account.accessManagement.edit(target_id, new_access);
    }
  }

  console.info("Exporting access rules: finished");
  return export_holder;
}

export { accessExport };
