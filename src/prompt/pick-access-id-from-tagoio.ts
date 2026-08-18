import { type AccessInfo, Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Builds the autocomplete choices. Exported so the labelling is
 * testable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * The id is part of the label because policy names collide heavily — nine of the
 * twelve on a real profile share the `[TagoIO Permission for Analysis]` prefix,
 * differing only by the analysis they cover.
 */
function toAccessChoices(list: AccessInfo[]) {
  return list.map((x) => ({ title: x.name ? `${x.name} [${x.id}]` : x.id, value: x.id }));
}

/**
 * @description Interactive autocomplete picker that lists the profile's access
 * policies and resolves to the chosen policy's id. Mirrors
 * `pickSecretIDFromTagoIO` so the access-management-* commands share the prompt
 * UX of the other families.
 *
 * The field list is deliberately minimal: probed against a live profile, asking
 * a listing for `permissions` or `targets` makes the API answer "Sorry, Internal
 * Error" — a 500 rather than an omitted field.
 */
async function pickAccessIDFromTagoIO(resources: Resources, message: string = "Which access policy you want to choose?") {
  const policyList = await resources.accessManagement.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: toAccessChoices(policyList as AccessInfo[]),
  });

  if (!id) {
    errorHandler("Access policy not selected");
  }

  return id as string;
}

export { pickAccessIDFromTagoIO, toAccessChoices };
