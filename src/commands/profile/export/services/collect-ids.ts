import { Account, Utils } from "@tago-io/sdk";
import { DeviceListItem, TagsObj } from "@tago-io/sdk";

import { Entity, IExportHolder } from "../types";

function getExportHolder(list: any[], import_list: any[], entity: Entity, export_holder: IExportHolder) {
  for (const item of list) {
    const export_id = item.tags.find((tag: TagsObj) => tag.key === export_holder.config.export_tag)?.value;
    if (!export_id) {
      continue;
    }

    const importItem = import_list.find((a) => a.tags.find((tag: any) => tag.key === export_holder.config.export_tag && tag.value == export_id));

    if (!importItem || !importItem.id) {
      continue;
    }

    if (entity === "devices") {
      if (!item.token) {
        throw `Device Token not found: ${item.name} [${item.id}]`;
      }
      if (!importItem.token) {
        throw `Device Token not found: ${importItem.name} [${importItem.id}]`;
      }
      export_holder.tokens[item.token] = importItem.token;
    }

    export_holder[entity][item.id] = importItem.id;
  }

  return export_holder;
}

async function getDeviceTokens(list: (DeviceListItem & { token?: string })[], account: Account) {
  for (const device of list) {
    const token = await Utils.getTokenByName(account, device.id);
    device.token = token as string;
  }

  return list;
}

async function collectIDs(account: Account, import_account: Account, entity: Entity, export_holder: IExportHolder) {
  // @ts-expect-error ts don't know what kind of tagsobj we are using
  let list = await account[entity].list({
    page: 1,
    amount: 99,
    fields: ["id", "tags"] as any,
    filter: { tags: [{ key: export_holder.config.export_tag }] },
  });
  // @ts-expect-error ts don't know what kind of tagsobj we are using
  let import_list = await import_account[entity].list({
    page: 1,
    amount: 99,
    fields: ["id", "tags"] as any,
    filter: { tags: [{ key: export_holder.config.export_tag }] },
  });

  if (entity === "devices") {
    list = await getDeviceTokens(list as DeviceListItem[], account);
    import_list = await getDeviceTokens(import_list as DeviceListItem[], import_account);
  }

  return getExportHolder(list, import_list, entity, export_holder);
}

export { getExportHolder, collectIDs };
