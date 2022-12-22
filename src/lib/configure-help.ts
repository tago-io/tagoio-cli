import { bold, cyan, italic, red, yellow } from "colors-cli";
import { Command } from "commander";

const setParamColor = (param: string) => (param.includes("<") ? red(`${param}`) : cyan(`${param}`));

function configureHelp(program: Command) {
  program.addHelpText("afterAll", `\n${red("<param>")}: required\n${cyan("[param]")}: optional`);

  program.configureHelp({
    subcommandTerm: (help) => {
      const t = help.name() === "help" ? "\n" : "";
      const usage = help.usage().replaceAll("[options] ", "");
      const params = setParamColor(` ${usage}`);
      return `${t}- ${bold(help.name())}${params}`;
    },
    subcommandDescription: (help) => {
      const aliases = help.alias() ? cyan(` (alias: ${help.alias()})`) : "";
      const options = help.usage().includes("options") ? yellow(` [OPTIONS]`) : "";
      return `${help.description()}${aliases}${options}`;
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
