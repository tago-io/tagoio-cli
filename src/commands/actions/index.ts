import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { actionCreate } from "./action-create.js";
import { actionDelete } from "./action-delete.js";
import { actionEdit } from "./action-edit.js";
import { actionInfo } from "./action-info.js";
import { actionList } from "./action-list.js";
import { actionDisable, actionEnable } from "./action-toggle.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function actionCommands(program: Command) {
  program.command("Actions Header");

  program
    .command("action-list")
    .alias("act-ls")
    .description("get the list of actions.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [actionName]", "partial name of the action")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--active", "only active actions")
    .option("--inactive", "only inactive actions")
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(actionList)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio action-list
    $ tagoio action-list --name Alert
    $ tagoio action-list -k type -v alarm --active
       `,
    );

  program
    .command("action-info")
    .alias("act-nf")
    .description("get information about an action, including its trigger and target.")
    .argument("[ID]", "ID of your action")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the action ID)")
    .action(actionInfo)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio action-info 62151835435d540010b768c4
    $ tagoio action-info 62151835435d540010b768c4 --json
       `,
    );

  program
    .command("action-create")
    .alias("act-crt")
    .description("create a new action.")
    .argument("[name]", "name of the action")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--type <type>", "trigger type: condition, resource, interval, schedule, mqtt_topic, usage_alert, condition_geofence (default: condition)")
    .option("--description <text>", "action description")
    .option("--inactive", "create the action inactive (default: active)")
    // condition trigger
    .option("--trigger-device <id>", "device ID to watch (--type condition)")
    .option("--trigger-variable <variable>", "variable to watch (--type condition)")
    .option("--trigger-is <operator>", "comparison: < > = ! >< * (--type condition)")
    .option("--trigger-value <value>", "value to compare against (--type condition)")
    .option("--trigger-second-value <value>", "upper bound for the >< operator")
    .option("--trigger-value-type <type>", "string|number|boolean|*; inferred from --trigger-value when omitted")
    .option("--trigger-unlock", "mark the trigger as an unlock condition; needs a second firing trigger, so use --trigger-json")
    // schedule / interval triggers
    .option("--cron <expression>", "cron expression (--type schedule)")
    .option("--timezone <timezone>", "timezone for the cron (--type schedule)")
    .option("--interval <expression>", "run every interval, e.g. '1 hour' (--type interval)")
    // resource trigger
    .option("--resource <kind>", "device|bucket|file|analysis|action|am|user|financial|profile (--type resource)")
    .option("--when <event>", "create|update|delete (--type resource)")
    .option("--resource-tag-key <key>", "tag key the resource must carry (--type resource)")
    .option("--resource-tag-value <value>", "tag value the resource must carry (--type resource)")
    // mqtt_topic trigger
    .option("--topic <topic>", "MQTT topic to watch, e.g. '/device/#' (--type mqtt_topic)")
    .option("--trigger-tag-key <key>", "tag key the device must carry (--type mqtt_topic)")
    .option("--trigger-tag-value <value>", "tag value the device must carry (--type mqtt_topic)")
    // usage_alert trigger
    .option("--service <name>", "service to watch, e.g. input, output (--type usage_alert)")
    .option("--condition <operator>", "= or > (--type usage_alert)")
    .option("--condition-value <number>", "threshold (--type usage_alert)", handleNumber)
    // targets
    .option("--run-script <analysisID>", "run an analysis (repeatable)", cmdRepeatableValue, [])
    .option("--notification", "send a notification (needs --subject and --message)")
    .option("--email <to>", "send an email (needs --subject and --message)")
    .option("--subject <text>", "subject for --notification / --email")
    .option("--message <text>", "message body for --notification / --email")
    .option("--post <url>", "POST to a URL")
    .option("--header <key=value>", "header for --post (repeatable)", cmdRepeatableValue, [])
    // escape hatches
    .option("--trigger-json <json>", "raw trigger array; required for condition_geofence")
    .option("--action-json <json>", "raw action object; covers sms, mqtt, twilio, sendgrid, smtp and sqs targets")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--silent", "do not prompt for missing input")
    .option("--json", "return result as json")
    .action(actionCreate)
    .addHelpText(
      "after",
      `
    Note on --trigger-value-type: when omitted, a numeric-looking --trigger-value
    infers "number" and anything else infers "string". Values like "true" stay
    strings — pass --trigger-value-type explicitly to override. A mismatched
    value type produces an action that never fires, with no error.

    Note on unlock: a trigger carrying "unlock" is the condition that re-arms the
    action, not one that fires it, so it always needs a firing trigger alongside.
    Build the pair with --trigger-json:

        --trigger-json '[{"device":"<id>","variable":"temperature","is":">","value":"30","value_type":"number"},
                         {"device":"<id>","variable":"temperature","is":"<","value":"20","value_type":"number","unlock":true}]'

    Note on multiple devices: a condition trigger can target every device
    carrying a tag instead of one device id, by passing tag_key/tag_value
    through --trigger-json:

        --trigger-json '[{"variable":"payload","is":"*","value":"*","value_type":"*","tag_key":"foo","tag_value":"bar"}]'

Example:
    $ tagoio action-create "Temp Alert" --type condition --trigger-device 62151835435d540010b768c4 \\
        --trigger-variable temperature --trigger-is '>' --trigger-value 30 --run-script 6215af1c1d1b2a0011f2e5a1
    $ tagoio action-create "Daily Report" --type schedule --cron "0 9 * * *" --timezone UTC \\
        --email team@acme.com --subject "Report" --message "Attached"
    $ tagoio action-create "MQTT Watch" --type mqtt_topic --topic "/device/#" \\
        --trigger-tag-key device_type --trigger-tag-value sensor --run-script 6215af1c1d1b2a0011f2e5a1
    $ tagoio action-create "Queue" --type condition --trigger-json '[{"device":"...","variable":"v","is":"*","value_type":"*"}]' \\
        --action-json '{"type":"queue-sqs","sqs_secret":"...","batch_enabled":true}'
       `,
    );

  program
    .command("action-edit")
    .alias("act-ed")
    .description("edit an action's name, description, status, tags, trigger, or target.")
    .argument("[ID]", "ID of your action")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name <name>", "new action name")
    .option("--description <text>", "new action description")
    .option("--active", "set the action active")
    .option("--inactive", "set the action inactive")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--trigger-json <json>", "replace the whole trigger array")
    .option("--action-json <json>", "replace the whole action object")
    .option("--silent", "do not prompt (requires the action ID)")
    .option("--json", "return result as json")
    .action(actionEdit)
    .addHelpText(
      "after",
      `
    Trigger and target are replaced as whole values, because the API overwrites
    these fields rather than merging them. To change one field, read the current
    value, edit it, and pass it back:

        tagoio action-info <id> --json | jq .trigger    # edit, then:
        tagoio action-edit <id> --trigger-json '<edited>'

Example:
    $ tagoio action-edit 62151835435d540010b768c4 --name "New Name"
    $ tagoio action-edit 62151835435d540010b768c4 -k env -v prod --merge-tags
       `,
    );

  program
    .command("action-enable")
    .alias("act-on")
    .description("activate an action.")
    .argument("[ID]", "ID of your action")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--silent", "do not prompt (requires the action ID)")
    .option("--json", "return result as json")
    .action(actionEnable)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio action-enable 62151835435d540010b768c4
       `,
    );

  program
    .command("action-disable")
    .alias("act-off")
    .description("deactivate an action without deleting it.")
    .argument("[ID]", "ID of your action")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--silent", "do not prompt (requires the action ID)")
    .option("--json", "return result as json")
    .action(actionDisable)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio action-disable 62151835435d540010b768c4
       `,
    );

  program
    .command("action-delete")
    .alias("act-dlt")
    .description("permanently delete an action.")
    .argument("[ID]", "ID of your action")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the action ID)")
    .option("--json", "return result as json")
    .action(actionDelete)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio action-delete 62151835435d540010b768c4
    $ tagoio action-delete 62151835435d540010b768c4 -y
       `,
    );
}

export { actionCommands };
