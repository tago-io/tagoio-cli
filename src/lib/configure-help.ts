import { Command } from "commander";
import kleur from "kleur";

const setParamColor = (param: string) => (param.includes("<") ? kleur.red().italic(`${param}`) : kleur.cyan().italic(`${param}`));

function configureHelp(program: Command) {
  program.addHelpText("afterAll", `\n${kleur.red("<param>")}: required\n${kleur.cyan("[param]")}: optional`);

  program.configureHelp({
    // longestOptionTermLength: (cmd, helper) => {
    //   return helper.visibleOptions(cmd).reduce((max, option) => {
    //     // eslint-disable-next-line no-control-regex
    //     const optionTerm = helper.optionTerm(option).replaceAll(/\u001b\[.*?m/g, "");
    //     return Math.max(max, optionTerm.length);
    //   }, 0);
    // },
    subcommandTerm: (help) => {
      const cmdName = help.name();
      const usage = help.usage().replaceAll("[options] ", "").replaceAll("[options]", "");
      if (usage.includes("Header")) {
        return `\n${kleur.bold(cmdName)}`;
      }

      const params = setParamColor(` ${usage}`);

      const alias = help.alias() ? `${help.alias()}, ` : "";

      let helpBreakLine = "\t";
      if (cmdName === "help") {
        helpBreakLine = `\n${kleur.bold("Help")}\n\t`;
      }

      return `${helpBreakLine}- ${alias}${cmdName}${params}`;
    },
    // subcommandDescription: (help) => {
    //   const cmdName = help.name();
    //   const header = categories.find((x) => (!x.marked || x.marked === cmdName) && cmdName.includes(x.category));
    //   // const options = help.usage().includes("options") ? "" : "";
    //   return `${header ? "      " : ""}${help.description()}`;
    // },
    optionTerm: (help) => {
      let flags = help.flags;
      const paramIndex = !flags.includes("<") ? flags.indexOf("[") : flags.indexOf("<");

      let params = "";
      if (paramIndex !== -1) {
        params = flags.slice(paramIndex);
        // params = setParamColor(params);
        flags = flags.slice(0, paramIndex);
      }

      return `${kleur.italic(flags)}${params}`;
    },
    argumentTerm: (help) => {
      const name = help.required ? kleur.red(`<${help.name()}>`) : kleur.cyan(`[${help.name()}]`);

      return `${kleur.bold(name)}`;
    },
    commandDescription: (help) => `Description:\n  ${help.description()}`,
    commandUsage: (help) => kleur.yellow(`\n  tago-cli ${help.name()} ${help.usage()}`),
  });
}

export { configureHelp };
