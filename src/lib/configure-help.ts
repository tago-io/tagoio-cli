import { bold, cyan, green, italic, red, yellow } from "colors-cli";
import { Command } from "commander";

const setParamColor = (param: string) => (param.includes("<") ? red(italic(`${param}`)) : cyan(italic(`${param}`)));

function configureHelp(program: Command) {
  program.addHelpText("afterAll", `\n${red("<param>")}: required\n${cyan("[param]")}: optional`);

  const categories = [
    { category: "analysis", marked: "", title: "Analysis" },
    { category: "device", marked: "", title: "Device" },
    // { category: "action", marked: "", title: "Action" },
    // { category: "dashboard", marked: "", title: "Fashboard" },
    { category: "help", marked: "", title: "Help" },
  ];

  // console.log(categories);
  // const subcommandTermList: string[] = [];
  program.configureHelp({
    // helpWidth: 500,
    // padWidth: () => 300,
    subcommandTerm: (help) => {
      const cmdName = help.name();
      const header = categories.find((x) => (!x.marked || x.marked === cmdName) && cmdName.includes(x.category));
      // console.log(header);
      if (header) {
        header.marked = cmdName;
      }
      const headerText = header ? `\n${bold(header.title)}\n` : "";

      const usage = help.usage().replaceAll("[options] ", "");
      const params = setParamColor(` ${usage}`);

      const alias = help.alias() ? `${help.alias()}, ` : "";

      // console.log(`${headerText}- ${bold(cmdName)}${params}`);
      return `${headerText}- ${alias}${cmdName}${params}`;
    },
    subcommandDescription: (help) => {
      const cmdName = help.name();
      const header = categories.find((x) => (!x.marked || x.marked === cmdName) && cmdName.includes(x.category));
      // const options = help.usage().includes("options") ? "" : "";
      return `${header ? "      " : ""}${help.description()}`;
    },
    optionTerm: (help) => {
      let flags = help.flags;
      const paramIndex = !flags.includes("<") ? flags.indexOf("[") : flags.indexOf("<");

      let params = cyan("");
      if (paramIndex !== -1) {
        params = flags.slice(paramIndex);
        params = setParamColor(params);
        flags = flags.slice(0, paramIndex);
      }

      return `${italic(flags)}${params}`;
    },
    argumentTerm: (help) => {
      const name = help.required ? red(`<${help.name()}>`) : cyan(`[${help.name()}]`);

      return `${bold(name)}`;
    },
    commandDescription: (help) => `Description:\n  ${help.description()}`,
    commandUsage: (help) => yellow(`\n  tago-cli ${help.name()} ${help.usage()}`),
  });
}

export { configureHelp };
