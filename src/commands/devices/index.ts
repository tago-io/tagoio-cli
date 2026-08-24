import { Command } from "commander";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";
import { changeBucketType } from "./change-bucket-type.js";
import { changeNetworkOrConnector } from "./change-network.js";
import { copyDeviceData } from "./copy-data.js";
import { getDeviceData } from "./data-get.js";
import { bkpDeviceData } from "./device-bkp.js";
import { deviceCreate } from "./device-create.js";
import { deviceDelete } from "./device-delete.js";
import { deviceEdit } from "./device-edit.js";
import { deviceInfo } from "./device-info.js";
import { deviceList } from "./device-list.js";
import { inspectorConnection } from "./device-live-inspector.js";
import { deviceParam } from "./device-param.js";
import { deviceToken } from "./device-token.js";

function handleNumber(value: any, _previous: any) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function deviceCommands(program: Command) {
  program.command("Devices Header");

  program
    .command("device-create")
    .alias("dv-crt")
    .description("create a new device.")
    .argument("[name]", "name of the device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--type <type>", "storage type: mutable or immutable (default: mutable)")
    .option("--network <id>", "network ID")
    .option("--connector <id>", "connector ID")
    .option("--serie <serial>", "serial number (EUI / MQTT client id / IMEI)")
    .option("--description <text>", "device description")
    .option("--chunk-period <period>", "day|week|month|quarter (required for immutable)")
    .option("--chunk-retention <number>", "chunks to retain; max by period: day 31, week 26, month/quarter 36 (required for immutable)", handleNumber)
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--inactive", "create the device inactive (default: active)")
    .option("--silent", "do not prompt for missing input")
    .option("--json", "return result as json")
    .action(deviceCreate)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-create "Sensor A" --network 62336c32ab6e0d0012e06c04 --connector 62333bd36977fc001a2990c8
    $ tagoio device-create "Logger" --type immutable --network <id> --connector <id> --chunk-period month --chunk-retention 3
       `,
    );

  program
    .command("device-delete")
    .alias("dv-dlt")
    .description("permanently delete a device and all its data.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the device ID)")
    .option("--json", "return result as json")
    .action(deviceDelete)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-delete 62151835435d540010b768c4
    $ tagoio device-delete 62151835435d540010b768c4 -y
       `,
    );

  program
    .command("device-edit")
    .alias("dv-ed")
    .description("edit a device's name, tags, status, network/connector, or retention.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name <name>", "new device name")
    .option("--description <text>", "new device description")
    .option("--active", "set the device active")
    .option("--inactive", "set the device inactive")
    .option("--network <id>", "network ID")
    .option("--connector <id>", "connector ID")
    .option("--chunk-retention <number>", "chunks to retain; max by period: day 31, week 26, month/quarter 36", handleNumber)
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the device ID)")
    .option("--json", "return result as json")
    .action(deviceEdit)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-edit 62151835435d540010b768c4 --name "New Name"
    $ tagoio device-edit 62151835435d540010b768c4 -k type -v sensor --merge-tags
       `,
    );

  program
    .command("device-token")
    .alias("dv-tkn")
    .description("manage device tokens: create, delete, or list.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--create <name>", "create a token with this name (expires never)")
    .option("--permission <permission>", "token permission: full, write, or read (default: full)")
    .option("--delete <token>", "delete a token by its value")
    .option("--list", "list tokens (default when no other op is given)")
    .option("--silent", "do not prompt (requires the device ID)")
    .option("--json", "return result as json")
    .action(deviceToken)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-token 62151835435d540010b768c4 --create "CI Token" --permission write
    $ tagoio device-token 62151835435d540010b768c4 --list
       `,
    );

  program
    .command("device-param")
    .alias("dv-prm")
    .description("manage device configuration parameters: set, delete, or list.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--set <key=value>", "set/update a param (repeatable)", cmdRepeatableValue, [])
    .option("--sent", "mark --set params as sent (default: false)")
    .option("--delete <paramID>", "delete a param by its id")
    .option("--list", "list params (default when no other op is given)")
    .option("--silent", "do not prompt (requires the device ID)")
    .option("--json", "return result as json")
    .action(deviceParam)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-param 62151835435d540010b768c4 --set dashboard_url=https://admin.tago.io --sent
    $ tagoio device-param 62151835435d540010b768c4 --list
       `,
    );

  program
    .command("device-inspector")
    .alias("inspect")
    .description("connect to your Device Live Inspector")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env [environment]", "environment from config.js")
    // .option("-p, --postOnly", "filter logs to show POST content only")
    // .option("-g, --getOnly", "filter logs to show GET content only")
    .action(inspectorConnection)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-inspector 62151835435d540010b768c4
    $ tagoio device-inspector 62151835435d540010b768c4 --env dev
       `,
    );

  program
    .command("device-info")
    .alias("info")
    .description("get information about a device and it's configuration parameters.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .option("-t, --tokens", "get tokens")
    .action(deviceInfo)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-info 62151835435d540010b768c4`,
    );

  program
    .command("device-list")
    .alias("dl")
    .description("get the list of devices.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [deviceName]", "partial name of the device name")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("-s, --stringify", "return list as text")
    .option("--tags", "display tags")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(deviceList)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-list
    $ tagoio device-list --name Device -s
    $ tagoio device-list -t device_type -v sensor
       `,
    );

  const isValidQuery = (query: any) => ["count", "sum", "avg", "min", "max", "first", "last"].includes(query);
  program
    .command("data")
    .description("get data from a device.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-g, --group <group>", "Filter by group")
    .option("--qty <qty>", "Request a given set amount of data", handleNumber, 15)
    .option("--start-date <date>", "Get data after date")
    .option("--end-date <date>", "Get data previous of date")
    .option("-q, --query [queryType]", "Perform an specific query", (value) => (isValidQuery(value) ? value : null))
    .option("--json", "return json list")
    .option("--stringify", "return as text")
    .option("-p, --post <dataJSON>", "send data to the device")
    .option("-v, --var <variable>", "Filter by variable", cmdRepeatableValue, [])
    .option("--delete", "delete data matching the filters (mutable devices only); requires a filter, confirms unless -y")
    .option("--empty", "delete ALL data on the device (mutable only); confirms unless -y")
    .option("-y, --yes", "skip the --delete/--empty confirmation")
    .action(getDeviceData)
    .addHelpText(
      "after",
      `

Example:
     $ tagoio data
     $ tagoio data -v temperature -qty 1 --json
     $ tagoio data 62151835435d540010b768c4 --post '{ "variable": "temperature", "value": 32 }'
     $ tagoio data 62151835435d540010b768c4
     $ tagoio data 62151835435d540010b768c4 -v temperature -qty 1
     $ tagoio data 62151835435d540010b768c4 --delete -v temperature
     $ tagoio data 62151835435d540010b768c4 --empty -y
     `,
    );

  program
    .command("device-backup")
    .alias("bkp")
    .description("backup data from a Device. Store it on TagoIO Cloud by default")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--local", "store file locally")
    .option("--restore", "restore a backup file")
    .action(bkpDeviceData)
    .addHelpText(
      "after",
      `

Example:
   $ tagoio bkp
   $ tagoio bkp 62151835435d540010b768c4
   $ tagoio bkp 62151835435d540010b768c4 --local
   `,
    );

  program
    .command("device-network")
    .alias("nc")
    .description(`change the device network and/or connector`)
    .argument("[ID/Token]", "ID/Token of your device")
    .option("-n, --networkID <network ID>", "network ID")
    .option("-c, --connectorID [connector ID]", "connector ID")
    .option("--env, --environment [environment]", "environment from config.js")
    .action(changeNetworkOrConnector)
    .addHelpText(
      "after",
      `
Example:
   $ tagoio device-network 62151835435d540010b768c4 -n 62151835435d540010b768c4 -c 62151835435d540010b768c4
   $ tagoio nc 62151835435d540010b768c4 -n 62151835435d540010b768c4 -c 62151835435d540010b768c4
   `,
    );

  program
    .command("device-type")
    .alias("dv-tp")
    .description(`change the bucket type to immutable or mutable`)
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env, --environment [environment]", "environment from config.js")
    .action(changeBucketType)
    .addHelpText(
      "after",
      `
      It's Recommended to backup data before changing the type, using:
        - tagoio bkp
      Then restore the data after changing the type, using:
        - tagoio bkp --restore

  Example:
     $ tagoio device-type
     $ tagoio device-type 62151835435d540010b768c4
     `,
    );

  program
    .command("device-copy")
    .alias("dv-cp")
    .description(`copy data from one device to another`)
    .option("--from [token/id]", "token/id of the device where data will be copied from")
    .option("--to [token/id]", "token/id of the device where data will be copied to")
    .option("--qty <number>", "amount of data to be copy", handleNumber, 10_000)
    .option("--env, --environment [environment]", "environment from config.js")
    .action(copyDeviceData)
    .addHelpText(
      "after",
      `

Example:
   $ tagoio device-copy
   $ tagoio device-copy --to 62151835435d540010b768c4 --from 78151835435d540010b768c4
   `,
    );
}

export { deviceCommands };
