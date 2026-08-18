import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { accessManagementCreate } from "./access-management-create.js";
import { accessManagementDelete } from "./access-management-delete.js";
import { accessManagementEdit } from "./access-management-edit.js";
import { accessManagementInfo } from "./access-management-info.js";
import { accessManagementList } from "./access-management-list.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

/**
 * Aliases are `am-list`, `am-info`, … rather than a bare `am`: that one belongs
 * to `analysis-mode`, and commander throws at startup on a duplicate, taking the
 * whole CLI down rather than just the new command.
 */
function accessManagementCommands(program: Command) {
  // One word before "Header": commander parses the rest as arguments, so
  // "Access Management Header" would render as just "Access" anyway.
  program.command("Access Header");

  program
    .command("access-management-list")
    .alias("am-list")
    .description("get the list of access policies.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [name]", "partial name of the policy")
    .option("--active", "only active policies")
    .option("--inactive", "only inactive policies")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--amount <number>", "how many policies to fetch (default: 100)", handleNumber)
    .option("--order-by <field>", "name, active, created_at or updated_at")
    .option("--order <direction>", "asc or desc (default: asc)")
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(accessManagementList)
    .addHelpText(
      "after",
      `
    A listing cannot show what a policy grants — the API refuses to return
    permissions or targets here. Read them with 'access-management-info <id>'.

Example:
    $ tagoio access-management-list
    $ tagoio am-list --name "Alert Dispatch"
    $ tagoio am-list --inactive
    $ tagoio am-list -k cli_test -v 1
       `,
    );

  program
    .command("access-management-info")
    .alias("am-info")
    .description("get information about an access policy, including what it grants.")
    .argument("[ID]", "ID of your access policy")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the policy ID)")
    .action(accessManagementInfo)
    .addHelpText(
      "after",
      `
    A policy's name says nothing about what it allows, so this command is where
    the permissions and targets actually become visible.

    --json emits them in the exact shape 'access-management-create' accepts, so
    a policy can be copied between profiles:

      $ tagoio am-info <id> --json > policy.json

Example:
    $ tagoio access-management-info 62151835435d540010b768c4
    $ tagoio am-info 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("access-management-create")
    .alias("am-create")
    .description("create a new access policy.")
    .argument("[name]", "name of the access policy")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--permissions <json>", "permissions as a JSON array (required)")
    .option("--permissions-file <path>", "read the permissions from a JSON file instead")
    .option("--targets <json>", "targets as a JSON array (required)")
    .option("--targets-file <path>", "read the targets from a JSON file instead")
    .option("--inactive", "create the policy deactivated")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--silent", "do not prompt (requires the name)")
    .option("--json", "return result as json")
    .action(accessManagementCreate)
    .addHelpText(
      "after",
      `
    Permissions and targets are JSON because their structure is nested: a
    permission is { effect, action[], resource[] } where the resource is itself
    a path of segments, and a target is a triple. A flag syntax compact enough
    to type would not express either.

    Both are required — the API refuses a policy without them.

    Action and resource names are not checked here. The API's own rejection
    lists every valid value, which stays correct as the platform adds more.

    permissions: [{"effect":"allow","action":["access"],"resource":["device"]}]
    targets:     [["analysis","id","<analysis-id>"]]

    The easiest way to build one is to copy an existing policy:
      $ tagoio am-info <id> --json > policy.json

Example:
    $ tagoio access-management-create "Device Reader" \\
        --permissions '[{"effect":"allow","action":["access"],"resource":["device"]}]' \\
        --targets '[["analysis","id","62151835435d540010b768c4"]]'
    $ tagoio am-create "Copied" --permissions-file perms.json --targets-file targets.json
       `,
    );

  program
    .command("access-management-edit")
    .alias("am-edit")
    .description("edit an access policy: rename it, change what it grants, or its tags.")
    .argument("[ID]", "ID of your access policy")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--name <name>", "new name")
    .option("--permissions <json>", "replace the permissions with this JSON array")
    .option("--permissions-file <path>", "replace the permissions from a JSON file")
    .option("--targets <json>", "replace the targets with this JSON array")
    .option("--targets-file <path>", "replace the targets from a JSON file")
    .option("--activate", "mark the policy active")
    .option("--deactivate", "mark the policy inactive — reversible, unlike deleting")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the policy ID)")
    .option("--json", "return result as json")
    .action(accessManagementEdit)
    .addHelpText(
      "after",
      `
    Permissions and targets REPLACE the existing set — there is no merge for
    them, since half a permission set is not a meaningful thing to have. Pass
    every permission you want the policy to keep.

    Tags replace by default too, but --merge-tags keeps the ones you do not
    name.

    --deactivate is the reversible way to stop a policy granting anything.
    Prefer it over deleting when you might want the policy back.

Example:
    $ tagoio access-management-edit 62151835435d540010b768c4 --name "Renamed"
    $ tagoio am-edit 62151835435d540010b768c4 --deactivate
    $ tagoio am-edit 62151835435d540010b768c4 --permissions-file perms.json
       `,
    );

  program
    .command("access-management-delete")
    .alias("am-delete")
    .description("permanently delete an access policy.")
    .argument("[ID]", "ID of your access policy")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the policy ID)")
    .option("--json", "return result as json")
    .action(accessManagementDelete)
    .addHelpText(
      "after",
      `
    Anything relying on the policy loses access immediately, and nothing here
    can restore it. The confirmation names how many permissions and targets the
    policy carries, since its name does not say.

    To stop a policy granting access reversibly, use
    'access-management-edit <id> --deactivate' instead.

Example:
    $ tagoio access-management-delete 62151835435d540010b768c4
    $ tagoio am-delete 62151835435d540010b768c4 -y
       `,
    );
}

export { accessManagementCommands };
