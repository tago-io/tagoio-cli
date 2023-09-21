<br/>
<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="200px" alt="TODO"></img>
</p>

# Table of Contents
- [TagoIO Command Line Tools](#tagoio-command-line-tools)
- [How to Install](#how-to-install)
- [Command List](#command-list)
- [Analysis Runner](#analysis-runner)
- [Credentials Storage](#credentials-storage)
- [tagoconfig.json](#tagoconfigjson)
- [Working with Environments](#working-with-environments)
- [License](#license)

For more information on the latest release notes, please visit the [Release Notes section](https://github.com/tago-io/tagoio-cli/releases)

## TagoIO Command Line Tools
TagoIO Command Line Tools is a CLI tool that allows you to interact with TagoIO platform and manage your applications. You can use it to deploy, run, trigger, and debug your analysis, as well as to inspect, backup, and configure your devices. You can also export your applications from one profile to another.

To use this tool, you need to install it globally with npm and also install the builder dependency. You also need to generate a tagoconfig.json file for your project and a .tago-lock file for your profile. You can work with multiple environments by using the init and set-env commands.

For more information about the commands and options of this tool, please refer to the [Command List](#command-list) section.

![CLI Demo](./docs/images/tagoio_inspect.png)

# How to Install
To install TagoIO Command Line Tools, you need to follow these steps:

- Make sure you have Node.js and npm installed on your machine. You can check the installation guide [here](^1^).
- Run the command `npm install -g @tago-io/cli` to install the CLI tool globally.
- Run the command `npm install -g @tago-io/builder` to install the builder dependency.
- Run the command `tagoio init` to generate a tagoconfig.json file for your project. You will be asked to provide your credentials. Alternatively, you can use your profile-token which you can get from your TagoIO account.
- (Optional) Run the command `tagoio login` to store your profile token in a .tago-lock file. You can use different environments by adding an argument to this command.

You have successfully installed TagoIO Command Line Tools. You can now use it to manage your applications on TagoIO platform. 

## Command List
List of commands of the CLI
**Usage**:
- tagoio [options] [command]

**Options**:
-  -V, --version                          output the version number
-  -h, --help                             display help for command

**Commands**:

| Command | Description |
| ---- | ---- |
| init [environment] | create/update the config file for analysis in your current folder |
| login [environment] | login to your account and store profile_token in the .tago/tago-lock |
| set-env [environment] | set your default environment from tagoconfig.ts |
| list-env | list all your environment and show current default |
| | |
| **Analysis** | |
| deploy, analysis-deploy [name] | deploy your analysis to TagoIO |
| run, analysis-run [name] | run your TagoIO analysis from your machine. |
| at, analysis-trigger [name] | send a signal to trigger your analysis TagoIO |
| ac, analysis-console [name] | connect to your Analysis Console |
| ad, analysis-duplicate [ID] | duplicate your Analysis |
| am, analysis-mode [name] | change an analysis or group of analysis to run on tago/external |
| | |
| **Devices** | |
| inspect, device-inspector [ID/Token] | connect to your Device Live Inspector |
| info, device-info [ID/Token] | get information about a device and it's configuration parameters |
| dl, device-list  | get the list of devices |
| data [ID/Token] | get data from a device |
| bkp, device-backup [ID/Token] | backup data from a Device. Store it on the TagoIO Cloud by default |
| device-type [ID/Token] | change the bucket type to immutable or mutable |
| |
| **Profiles** | |
| export, app-export | export an application from one profile to another |

## Analysis Runner
When writing up your analysis, make sure you have the following lines at end of the code:

```javascript
Analysis.use(startAnalysis, { token: process.env.T_ANALYSIS_TOKEN });

```

If you want to use the Debugger with -D, make sure you have a **.swcrc** file with sourceMaps activated. This repository contains a .swcrc.example file if you prefer to just copy to your folder.

## Credentials Storage
When running **tagoio login** or **tagoio init**, the CLI will store your Profile-Token in the current folder on your terminal.

The Profile-Token credential is encrypted under a *.tago-lock.{env}.lock* file.

## tagoconfig.json
The tagoconfig.json file stores information about your current javascript/typescript project. It will contain information about your analysis, their ID's and names.

- Run the command **tagoio init** in order to create the tagoconfig.json.

Having a tagoconfig.json is required in order to run the following cmds:
* tagoio deploy
* tagoio trigger
* tagoio run

You will also be required to have the .tago-lock file for a given environment.


## Working with Environments
The CLI is optimized to work within multiple environments. That makes it easier to alternate environments for deployment and management of your analysis.

You can create new environments by running the **tagoio init** cmd.

You can change your current environment by running the **tagoio set-env** cmd.

## License

TagoIO SDK for JavaScript in the browser and Node.js is released under the [Apache-2.0 License](https://github.com/tagoio-cli/blob/master/LICENSE.md).
