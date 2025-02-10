import { Account, Device, Utils } from "@tago-io/sdk";

import { errorHandler, infoMSG } from "../../../../lib/messages";
import { replaceObj } from "../../../../lib/replace-obj";
import { IExport, IExportHolder } from "../types";

/**
 * @description Replace the device token if the token being exported has the serial_number
 */
async function _generateDeviceToken(account: Account, import_account: Account, target_id: string, new_token: string, device_id: string) {
  let device_tokens = await account.devices.tokenList(device_id, { fields: ["name", "permission", "expire_time", "serie_number"] });
  device_tokens = device_tokens.filter((token) => token.serie_number);

  if (device_tokens.length === 0) {
    return;
  }

  await import_account.devices.tokenDelete(new_token).catch(errorHandler);

  for (const token of device_tokens) {
    await import_account.devices
      .tokenCreate(target_id, {
        name: token.name as string,
        permission: token.permission || "full",
        expire_time: "never",
        serie_number: token.serie_number || undefined,
      })
      .catch(errorHandler);
  }
}

async function deviceExport(account: Account, import_account: Account, export_holder: IExportHolder, config: IExport) {
  infoMSG("Exporting devices: started");

  const list = await account.devices.list({
    amount: 99,
    fields: ["id", "name", "tags", "type"],
    filter: { tags: [{ key: export_holder.config.export_tag }] },
  });
  const import_list = await import_account.devices.list({
    amount: 99,
    fields: ["id", "tags"],
    filter: { tags: [{ key: export_holder.config.export_tag }] },
  });

  for (const { id: device_id, name } of list) {
    console.info(`Exporting devices ${name}`);
    const device = await account.devices.info(device_id);

    const export_id = device.tags.find((tag) => tag.key === export_holder.config.export_tag)?.value;

    const token = await Utils.getTokenByName(account, device_id);

    let { id: target_id } = import_list.find((device) => device.tags.find((tag) => tag.key === export_holder.config.export_tag && tag.value == export_id)) || {
      id: null,
    };

    let new_token: string;
    const new_device = replaceObj(device, export_holder.devices);
    delete new_device.bucket;
    if (!target_id) {
      ({ device_id: target_id, token: new_token } = await import_account.devices.create(new_device));

      const export_device = new Device({ token, region: !process.env.TAGOIO_API ? "us-e1" : "env" });
      const import_device = new Device({ token: new_token, region: !process.env.TAGOIO_API ? "us-e1" : "env" });

      for await (const items of export_device.getDataStreaming({ variables: config.data })) {
        await import_device.sendData(items).catch(errorHandler);
      }

      // Add Configurations Parameters
      const export_param_list = await export_device.getParameters("all");
      const param_list_map = export_param_list.map(({ id, ...param }) => param);
      await import_account.devices.paramSet(target_id, param_list_map).catch(errorHandler);
    } else {
      await import_account.devices.edit(target_id, {
        parse_function: new_device.parse_function,
        tags: new_device.tags,
        active: new_device.active,
        visible: new_device.visible,
      });
      new_token = await Utils.getTokenByName(import_account, target_id);
      // TODO: Check whether to update the CFG for devices that already exist.
    }

    // Replace the device token if the token being exported has the serial_number
    await _generateDeviceToken(account, import_account, target_id, new_token, device_id);

    export_holder.devices[device_id] = target_id;
    export_holder.tokens[token] = new_token;
  }

  console.info("Exporting devices: finished");
  return export_holder;
}

export { deviceExport };
