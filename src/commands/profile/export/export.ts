import { Account } from "@tago-io/sdk";
import prompts from "prompts";
import kleur from "kleur";
import { errorHandler, infoMSG, successMSG } from "../../../lib/messages";
import { readToken } from "../../../lib/token";
import { pickEnvironment } from "../../../prompt/pick-environment";
import { confirmPrompt } from "../../../prompt/confirm";
import { EntityType, IExport, IExportHolder } from "./types";
import { accessExport } from "./services/access-export";
import { actionsExport } from "./services/actions-export";
import { analysisExport } from "./services/analysis-export";
import { collectIDs } from "./services/collect-ids";
import { dashboardExport } from "./services/dashboards-export";
import { deviceExport } from "./services/devices-export";
import { dictionaryExport } from "./services/dictionary-export";
import { runButtonsExport } from "./services/run-buttons-export";
import { setupExport } from "./export-setup";

const ENTITY_ORDER: EntityType[] = ["devices", "analysis", "dashboards", "access", "run", "actions", "dictionaries"];
interface IExportOptions {
  from: string;
  to: string;
  fromToken?: string;
  toToken?: string;
  entity: EntityType[];
  setup: string;
}

async function resolveTokens(userConfig: IExport, options: IExportOptions) {
  if (!userConfig.export.token && !options.from) {
    options.from = await pickEnvironment("Select the environment which will be exporting the application");
  }

  if (!userConfig.import.token && !options.to) {
    options.from = await pickEnvironment("Select the environment that will be receiving the application");
  }

  if (options.from) {
    const token = readToken(options.from);
    if (!token) {
      errorHandler(`Token for environment ${options.from} not found. Did you try "tago-cli login ${options.from}" ?`);
      process.exit(0);
    }
    userConfig.export.token = token;
  }

  if (options.to) {
    const token = readToken(options.to);
    if (!token) {
      errorHandler(`Token for environment ${options.to} not found. Did you try "tago-cli login ${options.to}" ?`);
      process.exit(0);
    }
    userConfig.import.token = token;
  }

  if (userConfig.import.token === userConfig.export.token) {
    errorHandler("Don't export application to the same profile!");
    process.exit(0);
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
  const exportAcc = new Account({ token: userConfig.export.token });
  const importAcc = new Account({ token: userConfig.import.token });

  const errorWhenReading = (error: any, type: string) => {
    errorHandler(`${type} profile: ${error}`);
    throw error;
  };

  const {
    info: { name: exportName },
  } = await exportAcc.profiles.info("current").catch((error) => errorWhenReading(error, "Export"));

  const {
    info: { name: importName },
  } = await importAcc.profiles.info("current").catch((error) => errorWhenReading(error, "Import"));

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
    },

    // Account where the entities will be pasted to.
    import: {
      token: options?.["toToken"] as string,
    },
  };

  await resolveTokens(userConfig, options);
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

  const account = new Account({ token: userConfig.export.token });
  const import_account = new Account({ token: userConfig.import.token });

  const import_rule = ENTITY_ORDER.filter((entity) => userConfig.entities.includes(entity));
  let export_holder: IExportHolder = {
    devices: {},
    analysis: {},
    dashboards: {},
    tokens: { [userConfig.export.token]: userConfig.import.token },
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
        export_holder = await dashboardExport(account, import_account, export_holder);
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
        export_holder = await runButtonsExport(account, import_account, export_holder);
        idCollection.push("run");
        break;
      default:
        break;
    }
  }
  successMSG("====Exporting ended with success====");
}

export { startExport, ENTITY_ORDER, chooseEntities, enterExportTag };
