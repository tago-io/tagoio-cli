import { Command } from "commander";
import { deviceInfo } from "./device-info";
import { deviceList } from "./device-list";
import { inspectorConnection } from "./device-live-inspector";

function deviceCommands(program: Command) {
  program
    .command("device-inspector")
    .description("Connect to your Device Live Inspector")
    .argument("<ID/Token>", "ID/Token of your device")
    .option("--env [environment]", "environment from config.js")
    // .option("-p, --postOnly", "filter logs to show POST content only")
    // .option("-g, --getOnly", "fiter logs to show GET content only")
    .action(inspectorConnection)
    .addHelpText(
      "after",
      `

    Example:
       $ tago-cli device-inspector 62151835435d540010b768c4
       $ tago-cli device-inspector 62151835435d540010b768c4 --env dev
       `
    );

  program
    .command("device-info")
    .description("Get information about a device and it's configuration parameters.")
    .argument("<ID/Token>", "ID/Token of your device")
    .option("--env [environment]", "environment from config.js")
    .action(deviceInfo)
    .addHelpText(
      "after",
      `

    Example:
       $ tago-cli device-info 62151835435d540010b768c4`
    );

  program
    .command("device-list")
    .description("Get information about a device and it's configuration parameters.")
    .option("-n, --name [deviceName]", "partial name of the device name")
    .option("-k, --tagkey [key]", "tag key to filter in")
    .option("-v, --tagvalue [value]", "tag value to filter in")
    .option("-s, --stringify", "return list as text")
    .action(deviceList)
    .addHelpText(
      "after",
      `

    Example:
       $ tago-cli device-list
       $ tago-cli device-list --name Device -s
       $ tago-cli device-list -t device_type -v sensor
       `
    );

  return program;
}

export { deviceCommands };
