import prompts from "prompts";

import { Account } from "@tago-io/sdk";

import { errorHandler } from "../lib/messages";

async function pickDeviceIDFromTagoIO(account: Account, message: string = "Which device you want to choose?") {
  const deviceList = await account.devices.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: deviceList.map((x) => ({ title: x.name, value: x.id })),
  });

  if (!id) {
    errorHandler("Device not selected");
    return process.exit();
  }

  return id as string;
}

export { pickDeviceIDFromTagoIO };
