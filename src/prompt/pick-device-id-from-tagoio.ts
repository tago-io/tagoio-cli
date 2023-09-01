import prompts from "prompts";

import { Account } from "@tago-io/sdk";

async function pickDeviceIDFromTagoIO(account: Account, message: string = "Which device you want to pick?") {
  const deviceList = await account.devices.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: deviceList.map((x) => ({ title: x.name, value: x.id })),
  });

  return id as string;
}

export { pickDeviceIDFromTagoIO };
