import kleur from "kleur";
import prompts from "prompts";

import { Account } from "@tago-io/sdk";

import { addOnGitIgnore } from "../../../lib/add-to-gitignore";
import { getEnvironmentConfig } from "../../../lib/config-file";
import { getCurrentFolder } from "../../../lib/get-current-folder";
import { errorHandler, infoMSG, successMSG } from "../../../lib/messages";
import { confirmPrompt } from "../../../prompt/confirm";
import { pickEnvironment } from "../../../prompt/pick-environment";
import { setupExport } from "./export-setup";
import { accessExport } from "./services/access-export";
import { actionsExport } from "./services/actions-export";
import { analysisExport } from "./services/analysis-export";
import { collectIDs } from "./services/collect-ids";
import { dashboardExport } from "./services/dashboards-export";
import { deviceExport } from "./services/devices-export";
import { dictionaryExport } from "./services/dictionary-export";
import { runButtonsExport } from "./services/run-buttons-export";
import { EntityType, IExport, IExportHolder } from "./types";

const ENTITY_ORDER: EntityType[] = ["devices", "analysis", "dashboards", "access", "run", "actions", "dictionaries"];
interface IExportOptions {
  from: string;
  to: string;
  fromToken?: string;
  toToken?: string;
  entity: EntityType[];
  setup: string;
  pick?: boolean;
}

async function resolveTokens(userConfig: IExport, options: IExportOptions) {
  if (!userConfig.export.token && !options.from) {
    options.from = await pickEnvironment("Select the environment which will be exporting the application");
  }

  if (!userConfig.import.token && !options.to) {
    options.to = await pickEnvironment("Select the environment that will be receiving the application");
  }

  if (options.from) {
    const config = getEnvironmentConfig(options.from);
    if (!config || !config.profileToken) {
      errorHandler(`Token for environment ${options.from} not found. Did you try "tagoio login ${options.from}" ?`);
      process.exit(0);
    }

    userConfig.export.token = config.profileToken;
    userConfig.export.region = config.profileRegion;
    infoMSG(`Export from ${kleur.cyan(options.from)} environment selected.`);
  }

  if (options.to) {
    const config = getEnvironmentConfig(options.to);
    if (!config || !config.profileToken) {
      errorHandler(`Token for environment ${options.to} not found. Did you try "tagoio login ${options.to}" ?`);
      process.exit(0);
    }

    userConfig.import.token = config.profileToken;
    userConfig.import.region = config.profileRegion;
    infoMSG(`Export to ${kleur.cyan(options.to)} environment selected.`);
  }
}

async function chooseEntities(selectedEntities: EntityType[], removeEntities: EntityType[] = []) {
  const entityList = ENTITY_ORDER.filter((x) => !removeEntities.includes(x)).map((x) => ({
    title: x,
    selected: selectedEntities.length === 0 || selectedEntities.includes(x),
    value: x,
  }));

  const { entities } = await prompts({
    message: "Choose the entities that will be exported:",
    name: "entities",
    type: "autocompleteMultiselect",
    choices: entityList,
  });

  return entities as EntityType[];
}

async function enterExportTag(defaultTag: string) {
  const { exportTag } = await prompts({
    message: "Enter the export tag of your entities:",
    name: "exportTag",
    type: "text",
    initial: defaultTag,
  });

  return exportTag;
}

async function confirmEnvironments(userConfig: IExport) {
  const exportAcc = new Account({ token: userConfig.export.token, region: userConfig.export.region });
  const importAcc = new Account({ token: userConfig.import.token, region: userConfig.import.region });

  const errorWhenReading = (error: any, type: string) => {
    errorHandler(`${type} profile: ${error}`);
    throw error;
  };

  const {
    info: { name: exportName, id: exportID },
  } = await exportAcc.profiles.info("current").catch((error) => errorWhenReading(error, "Export"));

  const {
    info: { name: importName, id: importID },
  } = await importAcc.profiles.info("current").catch((error) => errorWhenReading(error, "Import"));

  if (exportID === importID) {
    errorHandler("Don't export application to the same profile!");
    process.exit(0);
  }

  const confirmed = await confirmPrompt(`You will be exporting profile ${kleur.cyan(exportName)} to ${kleur.green(importName)}. Do you confirm ?`);
  if (!confirmed) {
    errorHandler("Cancelled");
    process.exit(0);
  }
}

async function collectParameters(options: IExportOptions) {
  const userConfig: IExport = {
    // Export tag with unique ID's. Without tag bellow, entity will not be copied or updated.
    export_tag: "export_id",

    // Entities that will be copied from the application.
    entities: options.entity,
    data: [],

    // Account that entities will be copied from.
    export: {
      token: options?.["fromToken"] as string, // Development
      region: "us-e1", // TODO: Support different regions
    },

    // Account where the entities will be pasted to.
    import: {
      token: options?.["toToken"] as string,
      region: "us-e1", // TODO: Support different regions
    },
  };

  await resolveTokens(userConfig, options);
  if (userConfig.import.token === userConfig.export.token) {
    errorHandler("Don't export application to the same profile!");
    process.exit(0);
  }

  userConfig.entities = await chooseEntities(options.entity);
  userConfig.export_tag = await enterExportTag(userConfig.export_tag);

  await confirmEnvironments(userConfig);

  return userConfig;
}

async function startExport(options: IExportOptions) {
  if (options.setup) {
    await setupExport(options);
    return;
  }

  const userConfig = await collectParameters(options);
  if (!userConfig) {
    return;
  }

  const account = new Account({ token: userConfig.export.token, region: userConfig.export.region });
  const import_account = new Account({ token: userConfig.import.token, region: userConfig.import.region });

  const import_rule = ENTITY_ORDER.filter((entity) => userConfig.entities.includes(entity));
  let export_holder: IExportHolder = {
    devices: {},
    analysis: {},
    dashboards: {},
    tokens: { [userConfig.export.token]: userConfig.import.token },
    config: { export_tag: userConfig.export_tag },
  };

  infoMSG("====Exporting started====");

  if (import_rule.includes("run")) {
    const run = await import_account.run.info();
    if (!run || !run.name) {
      errorHandler("Exported account doesn't have RUN enabled. Not possible to import RUN Buttons.");
      return;
    }
  }

  const idCollection: EntityType[] = [];
  for (const entity of import_rule) {
    switch (entity) {
      case "devices":
        export_holder = await deviceExport(account, import_account, export_holder, userConfig);
        idCollection.push("devices");
        break;
      case "dashboards":
        if (!idCollection.includes("analysis")) {
          idCollection.push("analysis");
          export_holder = await collectIDs(account, import_account, "analysis", export_holder);
        }
        if (!idCollection.includes("devices")) {
          idCollection.push("devices");
          export_holder = await collectIDs(account, import_account, "devices", export_holder);
        }
        export_holder = await dashboardExport(account, import_account, export_holder, options);
        idCollection.push("dashboards");
        break;
      case "access":
        if (!idCollection.includes("devices")) {
          idCollection.push("devices");
          export_holder = await collectIDs(account, import_account, "devices", export_holder);
        }
        if (!idCollection.includes("dashboards")) {
          idCollection.push("dashboards");
          export_holder = await collectIDs(account, import_account, "dashboards", export_holder);
        }
        export_holder = await accessExport(account, import_account, export_holder);
        break;
      case "analysis":
        if (!idCollection.includes("devices")) {
          idCollection.push("devices");
          export_holder = await collectIDs(account, import_account, "devices", export_holder);
        }
        export_holder = await analysisExport(account, import_account, export_holder);
        idCollection.push("analysis");
        break;
      case "actions":
        if (!idCollection.includes("devices")) {
          idCollection.push("devices");
          export_holder = await collectIDs(account, import_account, "devices", export_holder);
        }
        export_holder = await actionsExport(account, import_account, export_holder);
        idCollection.push("actions");
        break;
      case "dictionaries":
        export_holder = await dictionaryExport(account, import_account, export_holder);
        break;
      case "run":
        if (!idCollection.includes("dashboards")) {
          idCollection.push("dashboards");
          export_holder = await collectIDs(account, import_account, "dashboards", export_holder);
        }
        export_holder = await runButtonsExport(account, import_account, export_holder).catch((error) => {
          console.error(error);
          throw error;
        });
        idCollection.push("run");
        break;
      default:
        break;
    }
  }
  successMSG("====Exporting ended with success====");
  addOnGitIgnore(getCurrentFolder(), `exportBackup`);
}

export { startExport, ENTITY_ORDER, chooseEntities, enterExportTag, IExportOptions };
