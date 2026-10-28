import type { DashboardInfo, Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Builds the autocomplete choices. Exported so the labelling is
 * testable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 */
function toDashboardChoices(list: Pick<DashboardInfo, "id" | "label">[]) {
  return list.map((x) => ({ title: x.label ? `${x.label} [${x.id}]` : x.id, value: x.id }));
}

/**
 * @description Interactive autocomplete picker over the profile's dashboards.
 * Takes only the `dashboards` module so both `Resources` and the deprecated
 * `Account` (still used by `copy-tab`) can pass themselves in.
 */
async function pickDashboardIDFromTagoIO(resources: Pick<Resources, "dashboards">, message: string = "Which dashboard you want to choose?") {
  const dashboardList = await resources.dashboards.list({ amount: 100, fields: ["id", "label"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: toDashboardChoices(dashboardList),
  });

  if (!id) {
    errorHandler("Dashboard not selected");
  }

  return id as string;
}

export { pickDashboardIDFromTagoIO, toDashboardChoices };
