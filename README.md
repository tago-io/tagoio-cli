## TagoIO Command Line Tools

**Options**:
-  -V, --version                          output the version number
-  -h, --help                             display help for command

**Commands**:

| Command | Description |
| ---- | ---- |
|  init [options] | create/update the config file for analysis in your current folder |
|  login [options] \<environment> | login to your account and get a profile-token |
|  set-environment \<environment> | set default environment |
| | ... |
|  **Analysis** | ... |
|  deploy [options] \<name> | Deploy your analysis to TagoIO |
|  run [options] \<name>   | Run your analysis TagoIO if it's in External Mode |
|  analysis-trigger [options] \<name> | Send a signal to trigger your analysis TagoIO |
|  analysis-console [options] \<name> | Connect to your Analysis Console |
|  analysis-duplicate [options] \<ID> | Duplicate your Analysis |
| | ... |
|  **Devices** | ... |
|  device-inspector [options] \<ID/Token> | Connect to your Device Live Inspector |
|  device-info [options] \<ID/Token> | Get information about a device and it's configuration parameters. |
|  device-list [options] | List devices in your account. |
|  help [command] | display help for command |
