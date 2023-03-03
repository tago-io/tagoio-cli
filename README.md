<br/>
<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="200px" alt="TODO"></img>
</p>

## TagoIO Command Line Tools
This project is a CLI Tool to be used with TagoIO. It's main functionality is to help with deployment within multiple profiles, as well as providing useful tools for developers.

To work with Analysis, the tool requires that you run **tagoio init** to generate a tagoconfig.json

To connect to Devices, the CLI only requires you to generate your profile-token with **tagoio login**

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
| bkp, device-backup [ID/Token] | backup data from a Device. Store it on the TagoIO Cloud by default |
| device-type [ID/Token] | change the bucket type to immutable or mutable |
| |
| **Profiles** | |
| export, app-export | export an application from one profile to another |

## Analysis Runner
When writing up your analysis, make sure you have the following lines at end of the code:

```javascript
if (!process.env.T_TEST) {
  Analysis.use(startAnalysis, { token: process.env.T_ANALYSIS_TOKEN });
}

export { startAnalysis };
```

When running tests, make sure to set T_TEST environment variable on your terminal.

If you want to use the Debugger with -D, make sure you have a **.swcrc** file with sourceMaps activated

```
{
  "sourceMaps": true
}
```

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
