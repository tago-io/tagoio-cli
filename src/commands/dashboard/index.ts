import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { copyTabWidgets } from "./copy-tab.js";
import { dashboardCreate } from "./dashboard-create.js";
import { dashboardDelete } from "./dashboard-delete.js";
import { dashboardEdit } from "./dashboard-edit.js";
import { dashboardInfo } from "./dashboard-info.js";
import { dashboardList } from "./dashboard-list.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function dashboardCommands(program: Command) {
  program.command("Dashboards Header");

  program
    .command("dashboard-list")
    .alias("db-ls")
    .description("get the list of dashboards.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [name]", "partial label of the dashboard")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--amount <number>", "how many dashboards to fetch (default: 100)", handleNumber)
    .option("--page <number>", "page of results, starting at 1", handleNumber)
    .option("--order-by <field>", "label, created_at or updated_at")
    .option("--order <direction>", "asc or desc (default: asc)")
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(dashboardList)
    .addHelpText(
      "after",
      `
    The type column tells Normal ("dashboard") and Blueprint ("blueprint")
    dashboards apart. The API has no type filter, so there is no --type flag.

Example:
    $ tagoio dashboard-list
    $ tagoio db-ls --name fleet --order-by updated_at --order desc
       `,
    );

  program
    .command("dashboard-info")
    .alias("db-nf")
    .description("get information about a dashboard, including its tabs and Blueprint slots.")
    .argument("[ID]", "ID of your dashboard")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the dashboard ID)")
    .action(dashboardInfo)
    .addHelpText(
      "after",
      `
    Lists the tabs with their keys, which 'widget-create --tab' takes, and the
    Blueprint slots with their IDs, which widget data sources and filters use.
    --json returns the whole dashboard record, including its arrangement.

Example:
    $ tagoio dashboard-info 62151835435d540010b768c4
    $ tagoio db-nf 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("dashboard-create")
    .alias("db-crt")
    .description("create a new Normal or Blueprint dashboard.")
    .argument("[label]", "label of the dashboard")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--blueprint", "create a Blueprint dashboard instead of a Normal one")
    .option("--blueprint-devices <json>", "Blueprint slots as a JSON array (needs --blueprint)")
    .option("--blueprint-devices-file <path>", "read the Blueprint slots from a JSON file instead")
    .option("--tab <key=Label>", "tab to create (repeatable)", cmdRepeatableValue, [])
    .option("--tabs <json>", "tabs as a JSON array, for a type such as single_widget")
    .option("--tabs-file <path>", "read the tabs from a JSON file instead")
    .option("--hidden", "hide the dashboard from the sidebar")
    .option("--icon <name|url>", 'sidebar icon: a name such as "wifi", or an https URL')
    .option("--icon-color <hex>", 'icon color, such as "#8a3120" (needs --icon)')
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--silent", "do not prompt (requires the label)")
    .option("--json", "return result as json")
    .action(dashboardCreate)
    .addHelpText(
      "after",
      `
    The type cannot change after the dashboard is created.

    --tab key=Label makes a normal tab. --tabs takes the full tab objects, for
    a tab type: { "key", "value", "type" }, where "type" is "" for a normal
    tab, "hidden" for a tab users do not see, or "single_widget" for a tab
    whose one widget fills the screen.

    A tab's "conditions" limit who sees it in TagoRUN: [{ "resource": "user",
    "key", "value" }] matches the user's tags, and a user matching any one
    condition sees the tab. A tab without conditions shows to everyone.

    A Blueprint slot is { "name", "type": "device" | "entity", "conditions":
    [{ "key", "value" }] }, matching the tags of the devices or entities it
    offers. Leave out "id": the API assigns one, shown by 'dashboard-info'.
    "filter_conditions": [{ "type": "tag_match", "tag_key", "blueprint_device" }]
    narrows a slot by another: "blueprint_device" is the other slot's name
    (not its ID), and only options whose "tag_key" tag holds the ID picked
    there are offered.

Example:
    $ tagoio dashboard-create "Fleet Overview" --tab main=Overview --tab alerts=Alerts
    $ tagoio db-crt "Customer" --blueprint \\
        --blueprint-devices '[{"name":"customer","type":"device","conditions":[{"key":"device_type","value":"customer"}]}]'
       `,
    );

  program
    .command("dashboard-edit")
    .alias("db-ed")
    .description("edit a dashboard: rename it, replace its tabs or Blueprint slots, show or hide it, or change its tags.")
    .argument("[ID]", "ID of your dashboard")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--label <label>", "new label")
    .option("--tab <key=Label>", "replace the tabs (repeatable)", cmdRepeatableValue, [])
    .option("--tabs <json>", "replace the tabs with a JSON array, for a type such as single_widget")
    .option("--tabs-file <path>", "read the tabs from a JSON file instead")
    .option("--blueprint-devices <json>", "replace the Blueprint slots with a JSON array (Blueprint dashboards only)")
    .option("--blueprint-devices-file <path>", "read the Blueprint slots from a JSON file instead")
    .option("--visible", "show the dashboard in the sidebar")
    .option("--hidden", "hide the dashboard from the sidebar")
    .option("--icon <name|url>", 'sidebar icon: a name such as "wifi", or an https URL (keeps the stored color)')
    .option("--icon-color <hex>", 'icon color, such as "#8a3120" (keeps the stored icon)')
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the dashboard ID)")
    .option("--json", "return result as json")
    .action(dashboardEdit)
    .addHelpText(
      "after",
      `
    --tab and --blueprint-devices REPLACE the stored list. Pass every tab or
    slot you want to keep: widgets on a tab key you drop stop showing, and a
    slot needs its "id" kept so widgets bound to it keep working.
    'dashboard-info --json' shows the current lists.

    A tab's "conditions" limit who sees it in TagoRUN; see 'dashboard-create --help'.

Example:
    $ tagoio dashboard-edit 62151835435d540010b768c4 --label "Fleet"
    $ tagoio db-ed 62151835435d540010b768c4 --icon wifi --icon-color "#8a3120"
    $ tagoio db-ed 62151835435d540010b768c4 --tab main=Overview --tab map=Map
    $ tagoio db-ed 62151835435d540010b768c4 --tabs '[{"key":"app","value":"App","type":"single_widget"}]'
    $ tagoio db-ed 62151835435d540010b768c4 --tabs-file tabs.json
    $ tagoio db-ed 62151835435d540010b768c4 --blueprint-devices-file slots.json
       `,
    );

  program
    .command("dashboard-delete")
    .alias("db-dlt")
    .description("permanently delete a dashboard and its widgets.")
    .argument("[ID]", "ID of your dashboard")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the dashboard ID)")
    .option("--json", "return result as json")
    .action(dashboardDelete)
    .addHelpText(
      "after",
      `
    Every widget on the dashboard is deleted with it, including the source of
    its custom widgets.

Example:
    $ tagoio dashboard-delete 62151835435d540010b768c4
    $ tagoio db-dlt 62151835435d540010b768c4 -y
       `,
    );

  program
    .command("copy-tab")
    .description("copy a tab of a dashboard to another tab")
    .argument("[dashboardID]", "ID of the dashboard")
    .option("--from [tabID]", "ID of the Tab to copy")
    .option("--to [tabID]", "ID of the Tab to paste")
    .option("--env, --environment [environment]", "environment from config.js")
    .action(copyTabWidgets)
    .addHelpText(
      "after",
      `
      Running this command will completely erase the target tab and replace it with a copy of the source tab.

Example:
    $ tagoio copy-tab
    $ tagoio copy-tab 62151835435d540010b768c4 --from 1688653060637 --to 2688653060638
    $ tagoio copy-tab 62151835435d540010b768c4 --env dev
       `,
    );
}

export { dashboardCommands };
