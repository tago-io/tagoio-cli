import { Command } from "commander";
import { cmdRepeteableValue } from "../../lib/commander-repeatable";
import { getDeviceData } from "./data-get";
import { deviceInfo } from "./device-info";
import { deviceList } from "./device-list";
import { inspectorConnection } from "./device-live-inspector";

function handleNumber(value: any, _previous: any) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function deviceCommands(program: Command) {
  program.command("Devices Header");
  program
    .command("device-inspector")
    .alias("inspect")
    .description("connect to your Device Live Inspector")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("--env [environment]", "environment from config.js")
    // .option("-p, --postOnly", "filter logs to show POST content only")
    // .option("-g, --getOnly", "fiter logs to show GET content only")
    .action(inspectorConnection)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-inspector 62151835435d540010b768c4
    $ tagoio device-inspector 62151835435d540010b768c4 --env dev
       `
    );

  program
    .command("device-info")
    .alias("info")
    .description("get information about a device and it's configuration parameters.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("-env, --environment [environment]", "environment from config.js")
    .option("-js, --json", "return json list")
    .option("-raw, --raw", "get object the same as stored")
    .option("-tk, --tokens", "get tokens")
    .action(deviceInfo)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-info 62151835435d540010b768c4`
    );

  program
    .command("device-list")
    .alias("dl")
    .description("get the list of devices.")
    .option("-env, --environment [environment]", "environment from config.js")
    .option("-n, --name [deviceName]", "partial name of the device name")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeteableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeteableValue, [])
    .option("-s, --stringify", "return list as text")
    .option("--tags", "display tags")
    .option("-js, --json", "return json list")
    .option("-raw, --raw", "get object the same as stored")
    .action(deviceList)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio device-list
    $ tagoio device-list --name Device -s
    $ tagoio device-list -t device_type -v sensor
       `
    );

  program
    .command("data")
    .description("get data from a device.")
    .argument("[ID/Token]", "ID/Token of your device")
    .option("-env, --environment [environment]", "environment from config.js")
    .option("-var, --variable", "Filter by variable", cmdRepeteableValue, [])
    .option("-g, --group", "Filter by group")
    .option("-qty, --qty <qty>", "Request a given set amount of data", handleNumber, "15")
    .option("-start, --start-date", "Get data after date")
    .option("-end, --end-date", "Get data previous of date")
    .option("-js, --json", "return json list")
    .option("--stringify", "return as text")
    .option("--json", "return as json")
    .option("-p, --post <dataJSON>", "send data to the device")
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
     `
    );
}

export { deviceCommands };
