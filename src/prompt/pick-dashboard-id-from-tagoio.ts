import prompts from "prompts";

import { Account } from "@tago-io/sdk";

async function pickDashboardIDFromTagoIO(account: Account, message: string = "Which dashboard you want to choose?") {
  const deviceList = await account.dashboards.list({ amount: 100, fields: ["id", "label"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: deviceList.map((x) => ({ title: `${x.label} [${x.id}]`, value: x.id })),
  });

  return id as string;
}

export { pickDashboardIDFromTagoIO };
