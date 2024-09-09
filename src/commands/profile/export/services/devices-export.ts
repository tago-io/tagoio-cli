import { Account, Device, Utils } from "@tago-io/sdk";
import { errorHandler, infoMSG } from "../../../../lib/messages";
import { replaceObj } from "../../../../lib/replace-obj";
import { IExport, IExportHolder } from "../types";

async function deviceExport(account: Account, import_account: Account, export_holder: IExportHolder, config: IExport) {
  infoMSG("Exporting devices: started");

  const list = await account.devices.list({
    amount: 99,
    fields: ["id", "name", "tags", "type"],
    filter: { tags: [{ key: "export_id" }] },
  });
  const import_list = await import_account.devices.list({
    amount: 99,
    fields: ["id", "tags"],
    filter: { tags: [{ key: "export_id" }] },
  });

  for (const { id: device_id, name } of list) {
    console.info(`Exporting devices ${name}`);
    const device = await account.devices.info(device_id);

    const export_id = device.tags.find((tag) => tag.key === "export_id")?.value;

    const token = await Utils.getTokenByName(account, device_id);

    let { id: target_id } = import_list.find((device) => device.tags.find((tag) => tag.key === "export_id" && tag.value == export_id)) || { id: null };

    let new_token: string;
    const new_device = replaceObj(device, export_holder.devices);
    delete new_device.bucket;
    if (!target_id) {
      ({ device_id: target_id, token: new_token } = await import_account.devices.create(new_device));

      if (config.data && config.data.length > 0) {
        const device = new Device({ token: new_token, region: !process.env.TAGOIO_API ? "usa-1" : "env" });
        const old_device = new Device({ token });

        const data = await old_device.getData({
          variables: config.data,
          qty: 9999,
        });
        if (data.length > 0) {
          device.sendData(data).catch(errorHandler);
        }
      }
    } else {
      await import_account.devices.edit(target_id, {
        parse_function: new_device.parse_function,
        tags: new_device.tags,
        active: new_device.active,
        visible: new_device.visible,
      });
      new_token = await Utils.getTokenByName(import_account, target_id);
    }

    export_holder.devices[device_id] = target_id;
    export_holder.tokens[token] = new_token;
  }

  console.info("Exporting devices: finished");
  return export_holder;
}

export { deviceExport };
