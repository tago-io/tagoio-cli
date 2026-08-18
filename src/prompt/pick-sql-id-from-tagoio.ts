import { Resources, type SQLInfo } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Builds the autocomplete choices. Exported so the labelling is
 * testable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 */
function toSQLChoices(list: SQLInfo[]) {
  return list.map((x) => ({ title: x.name ? `${x.name} [${x.id}]` : x.id, value: x.id }));
}

/**
 * @description Interactive autocomplete picker that lists the profile's TagoSQL
 * queries and resolves to the chosen query's id. Mirrors
 * `pickAccessIDFromTagoIO` so the sql-* commands share the prompt UX of the
 * other families.
 *
 * `fields` is passed for intent even though the API currently ignores it here —
 * probed, asking a listing for six fields returned three. Requesting the two the
 * label needs stays correct if that ever changes.
 */
async function pickSQLIDFromTagoIO(resources: Resources, message: string = "Which SQL query you want to choose?") {
  const queryList = await resources.sql.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: toSQLChoices(queryList as SQLInfo[]),
  });

  if (!id) {
    errorHandler("SQL query not selected");
  }

  return id as string;
}

export { pickSQLIDFromTagoIO, toSQLChoices };
