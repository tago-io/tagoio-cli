import { Account } from "@tago-io/sdk";
import prompts from "prompts";

async function pickDeviceIDFromTagoIO(account: Account) {
  const deviceList = await account.devices.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message: "Which device you want to pick?",
    name: "id",
    type: "autocomplete",
    choices: deviceList.map((x) => ({ title: x.name, value: x.id })),
  });

  return id as string;
}

export { pickDeviceIDFromTagoIO };
