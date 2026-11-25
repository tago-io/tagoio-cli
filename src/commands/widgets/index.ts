import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { widgetCreate } from "./widget-create.js";
import { widgetDelete } from "./widget-delete.js";
import { widgetDeploy } from "./widget-deploy.js";
import { widgetEdit } from "./widget-edit.js";
import { widgetInfo } from "./widget-info.js";
import { widgetLink } from "./widget-link.js";
import { widgetList } from "./widget-list.js";
import { widgetMove } from "./widget-move.js";
import { widgetPull } from "./widget-pull.js";

function handleNumber(value: string, _previous: unknown) {
  // `Number("")` is 0, so an empty value would pass as a position.
  if (value.trim() === "" || Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

/** The data and filter flags `widget-create` and `widget-edit` share. */
function withSourceOptions(command: Command): Command {
  return command
    .option("--param <KEY=VALUE>", "widget parameter (repeatable; replaces the set)", cmdRepeatableValue, [])
    .option("--data <json>", "data sources (device variables) as a JSON array")
    .option("--data-file <path>", "read the data sources from a JSON file instead")
    .option("--max-data <number>", "most records per device the data sources return (Admin default: 1000)", handleNumber)
    .option("--frame-settings <json>", "frame keys to change: radius, padding, shadow, header_visibility")
    .option("--frame-settings-file <path>", "read the frame settings from a JSON file")
    .option("--device-filter <json>", "device filter groups as a JSON array")
    .option("--device-filter-file <path>", "read the device filter groups from a JSON file")
    .option("--user-filter <json>", "user filter groups as a JSON array")
    .option("--user-filter-file <path>", "read the user filter groups from a JSON file")
    .option("--entity-filter <json>", "entity filter groups as a JSON array")
    .option("--entity-filter-file <path>", "read the entity filter groups from a JSON file")
    .option("--entity-source <json>", "replace the entity data sources (rows of an entity or Blueprint entity slot) with a JSON array")
    .option("--entity-source-file <path>", "read the entity data sources from a JSON file")
    .option("--analysis <id>", "analysis to run when the widget sends data");
}

const FILTER_HELP = `
    Filters follow the Admin's Device, User and Entity Filters sections. Each
    flag takes a list of groups and replaces that section; sections you do not
    pass stay as they are. A group is:

      { "filters": [ { "tag_key": "device_type", "tag_value": "sensor" },
                     { "blueprint_device": "<slot id>", "blueprint_device_tag_match": "customer_id" } ],
        "data":    [ { "type": "parameter", "parameter": "name" },
                     { "type": "tag", "tag": "eui", "editable": true },
                     { "type": "configuration_parameter", "configuration_parameter": "address" } ] }

    Entity groups use { "type": "field", "field": "<field>" } columns. The CLI
    writes both the Admin's filter groups and the resource list the widget
    reads, so the Admin shows the same filters and saving there keeps them.
    'widget-info --json' shows the stored groups in this same shape.

    The entity filter lists entities by tag. To show an entity's rows, use
    --entity-source instead: [{ "id": "<entity or Blueprint entity slot id>",
    "view": ["field", ...] }]. With a slot ID the rows follow the entity picked
    in that slot. "index" defaults to id_updated_at_idx, "orderBy" ("asc" or
    "desc") to "desc" and "amount" to 1000; "editable" lists fields from
    "view" the widget may change. It replaces every entity data source on
    the widget, including ones set in the Admin.`;

function widgetCommands(program: Command) {
  // One word before "Header": commander parses the rest as arguments.
  program.command("Widgets Header");

  program
    .command("widget-list")
    .alias("wg-ls")
    .description("list the widgets on a dashboard, with their tab and position.")
    .argument("[dashboardID]", "ID of the dashboard")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--type <type>", 'only widgets of this type, e.g. "iframe" for custom widgets')
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--silent", "do not prompt (requires the dashboard ID)")
    .action(widgetList)
    .addHelpText(
      "after",
      `
    Reads each placed widget one by one, since the API has no widget listing.

Example:
    $ tagoio widget-list 62151835435d540010b768c4
    $ tagoio wg-ls 62151835435d540010b768c4 --type iframe --json
       `,
    );

  program
    .command("widget-info")
    .alias("wg-nf")
    .description("get information about a custom widget: its code, parameters, data sources and filters.")
    .argument("[widgetID]", "ID of the custom widget")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--dashboard <dashboardID>", "dashboard holding the widget")
    .option("--json", "return result as json")
    .option("--silent", "do not prompt (requires the IDs)")
    .action(widgetInfo)
    .addHelpText(
      "after",
      `
    Only custom widgets ("iframe") are handled.

Example:
    $ tagoio widget-info 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef
    $ tagoio wg-nf 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef --json
       `,
    );

  withSourceOptions(
    program
      .command("widget-create")
      .alias("wg-crt")
      .description("create a custom widget on a dashboard and place it.")
      .argument("[label]", "label of the widget")
      .option("--env, --environment [environment]", "environment from config.js")
      .option("--dashboard <dashboardID>", "dashboard to add the widget to")
      .option("--folder <folder>", "widget folder to register in widgetList and deploy"),
  )
    .option("--tab <key>", "tab key to place it on (default: the first tab)")
    .option("--x <number>", "column, 0-3 (default: 0)", handleNumber)
    .option("--y <number>", "row (default: below the tab's last widget)", handleNumber)
    .option("--width <number>", "width in columns, 1-4 (default: 4)", handleNumber)
    .option("--height <number>", "height in rows of 80 px (default: 6)", handleNumber)
    .option("--silent", "do not prompt (requires the label and --dashboard)")
    .option("--json", "return result as json")
    .action(widgetCreate)
    .addHelpText(
      "after",
      `
    Creates a custom widget ("iframe") and adds it to the dashboard layout. With
    --folder, the widget is also added to this environment's widgetList in
    tagoconfig.json and the folder is built and deployed to it.
    'widget-edit --help' describes the --frame-settings keys.
${FILTER_HELP}

Example:
    $ tagoio widget-create "Users" --dashboard 6a68b4f5e4b1e5000b5ab1ef --folder users-summary
    $ tagoio wg-crt "Sensors" --dashboard 6a68b4f5e4b1e5000b5ab1ef --tab main --param view_type=viewer \\
        --device-filter '[{"filters":[{"tag_key":"device_type","tag_value":"sensor"}],"data":[{"type":"parameter","parameter":"name"}]}]'
       `,
    );

  withSourceOptions(
    program
      .command("widget-edit")
      .alias("wg-ed")
      .description("edit a custom widget: label, parameters, data sources, filters or analysis.")
      .argument("[widgetID]", "ID of the custom widget")
      .option("--env, --environment [environment]", "environment from config.js")
      .option("--dashboard <dashboardID>", "dashboard holding the widget")
      .option("--label <label>", "new label"),
  )
    .option("--clear-data", "remove every data source")
    .option("--clear-device-filter", "remove the device filters")
    .option("--clear-user-filter", "remove the user filters")
    .option("--clear-entity-filter", "remove the entity filters")
    .option("--clear-entity-source", "remove the entity data sources")
    .option("--clear-analysis", "stop running an analysis when the widget sends data")
    .option("--silent", "do not prompt (requires the IDs)")
    .option("--json", "return result as json")
    .action(widgetEdit)
    .addHelpText(
      "after",
      `
    Each flag replaces what it names and keeps everything else, including the
    uploaded code, header buttons and the analysis.

    --frame-settings changes only what it names: "radius" { top_left,
    top_right, bottom_left, bottom_right }, "padding" { top, right, bottom,
    left }, "shadow" { hide } and "header_visibility" (show_always,
    show_on_hover or show_only_buttons). A corner or side left out keeps its
    stored value.
${FILTER_HELP}

Example:
    $ tagoio widget-edit 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef --label "Users"
    $ tagoio wg-ed 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef --user-filter-file users.json
    $ tagoio wg-ed 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef \\
        --frame-settings '{"radius":{"top_left":16,"top_right":16,"bottom_left":16,"bottom_right":16}}'
       `,
    );

  program
    .command("widget-move")
    .alias("wg-mv")
    .description("move a custom widget to another tab, position or size on its dashboard.")
    .argument("[widgetID]", "ID of the custom widget")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--dashboard <dashboardID>", "dashboard holding the widget")
    .option("--tab <key>", "tab key to move it to")
    .option("--x <number>", "column, 0-3", handleNumber)
    .option("--y <number>", "row", handleNumber)
    .option("--width <number>", "width in columns, 1-4", handleNumber)
    .option("--height <number>", "height in rows of 80 px", handleNumber)
    .option("--silent", "do not prompt (requires the IDs)")
    .option("--json", "return result as json")
    .action(widgetMove)
    .addHelpText(
      "after",
      `
    Moving to another tab puts the widget below that tab's last widget, at its
    current size, unless --x/--y/--width/--height say otherwise. Without --tab
    it stays on its tab and only the given position or size changes.

    On a "single_widget" tab the one widget fills the screen, so its position
    and size do not matter there.

Example:
    $ tagoio widget-move 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef --tab app
    $ tagoio wg-mv 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef --height 10
       `,
    );

  program
    .command("widget-delete")
    .alias("wg-dlt")
    .description("take a custom widget off its dashboard and delete it.")
    .argument("[widgetID]", "ID of the custom widget")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--dashboard <dashboardID>", "dashboard holding the widget")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the IDs)")
    .option("--json", "return result as json")
    .action(widgetDelete)
    .addHelpText(
      "after",
      `
    Also removes the widget from this environment's widgetList.

Example:
    $ tagoio widget-delete 6ad1084c174a0b000cb231a4 --dashboard 6a68b4f5e4b1e5000b5ab1ef -y
       `,
    );

  program
    .command("widget-link")
    .alias("wg-ln")
    .description("link custom widgets that already exist in the profile to widget folders in widgetList.")
    .argument("[folder]", "widget folder under widgetPath, holding an App.tsx")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--dashboard <dashboardID>", "dashboard holding the widgets")
    .option("--widget <widgetID>", "custom widget to link to the folder (repeatable)", cmdRepeatableValue, [])
    .option("--silent", "do not prompt (requires the folder, --dashboard and --widget)")
    .option("--json", "return result as json")
    .action(widgetLink)
    .addHelpText(
      "after",
      `
    Without arguments, pick the dashboards, then their custom widgets, then a
    folder for each widget ("> Skip" leaves one unlinked). Widgets already in
    widgetList come checked. For the dashboards you pick, the answer replaces
    their widgetList entries, so a widget you uncheck or skip is unlinked;
    entries on other dashboards stay as they are.

    With a folder, --dashboard and --widget, the widgets are linked without
    prompts. A widget already linked to another folder moves to this one.

    Only folders under widgetPath (default ./widgets) that hold an App.tsx can
    be linked. Run 'widget-deploy <folder>' afterwards to upload the code.

Example:
    $ tagoio widget-link
    $ tagoio wg-ln customer-table --dashboard 6a68b4f5e4b1e5000b5ab1ef --widget 6ad1084c174a0b000cb231a4
       `,
    );

  program
    .command("widget-deploy")
    .alias("wg-dp")
    .description("build a custom widget folder and upload it to every widget it is mapped to.")
    .argument("[folder]", "widget folder from widgetList")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--all", "deploy every widget in widgetList (for CI/CD)")
    .option("--dry-run", "build only; write the file to the build folder without uploading")
    .option("-t, --token <profile-token>", "profile token for this run, bypassing the lock file (CI/CD)")
    .option("--silent", "do not prompt (requires the folder or --all)")
    .option("--json", "return result as json")
    .action(widgetDeploy)
    .addHelpText(
      "after",
      `
    Each widgetList entry maps a folder under widgetPath (default ./widgets) to
    a custom widget: { "folder", "dashboard_id", "widget_id" }. A folder placed
    on several widgets has one entry each, and a deploy updates all of them.

    The build bundles <folder>/App.tsx with its local modules (shared folders
    included) into one .tsx, written to <buildPath>/widgets/<folder>.tsx. Each
    package import is pinned to the version in the nearest deno.json "imports"
    or package.json "dependencies"; an undeclared package fails the build.
    CSS imports are dropped: the platform injects Tailwind when a manifest
    lists tailwindcss.

    The platform bundles the upload. If its bundle fails, the source is saved
    but the widget keeps running its previous build, so the deploy fails. On
    the per-minute upload limit it waits once and tries again.

Example:
    $ tagoio widget-deploy users-summary
    $ tagoio widget-deploy --all --silent
    $ tagoio wg-dp alerts --dry-run
       `,
    );

  program
    .command("widget-pull")
    .alias("wg-pl")
    .description("download the source a custom widget runs into the build folder.")
    .argument("[folder]", "widget folder from widgetList")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--all", "pull every widget in widgetList")
    .option("-t, --token <profile-token>", "profile token for this run, bypassing the lock file (CI/CD)")
    .option("--silent", "do not prompt (requires the folder or --all)")
    .option("--json", "return result as json")
    .action(widgetPull)
    .addHelpText(
      "after",
      `
    Writes <buildPath>/widgets/<folder>.<widget id>.published.tsx for each
    placement, to compare with a local build or pick up an edit made in the
    Admin. It never writes into the widget folder: the published file is the
    single built file and would replace the folder's modules.

Example:
    $ tagoio widget-pull users-summary
       `,
    );
}

export { widgetCommands };
