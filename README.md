## TagoIO Command Line Tools
This project is a CLI Tool to be used with TagoIO. It's main functionality is to help with deployment within multiple profiles, as well as providing useful tools for developers.

To work with Analysis, the tool requires that you run **tagoio init** to generate a tagoconfig.json
To connect to Devices, the CLI only requires you to have generate your profile-token with **tagoio login**

# How to Install
- Run **npm install -g @tago-io/cli** to install this package globally.

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
| |
| **Profiles** | |
| export, app-export | export application from one profile to another |


## License

TagoIO SDK for JavaScript in the browser and Node.js is released under the [Apache-2.0 License](https://github.com/tagoio-cli/blob/master/LICENSE.md).
