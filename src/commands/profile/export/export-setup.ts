/* eslint-disable @typescript-eslint/unbound-method */
import { Account, TagsObj } from "@tago-io/sdk";
import kleur from "kleur";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../../lib/messages";
import { chooseEntities, enterExportTag } from "./export";
import { ENTITY_ORDER, EntityType } from "./types";

interface ITagValues {
  [key: string]: string[];
}
const ALL_EXPORT_TAG_VALUES = ENTITY_ORDER.reduce((f, i) => {
  f[i] = [];
  return f;
}, {} as ITagValues);

function isDuplicateAndUpdateTagList(entity: EntityType, myTag?: TagsObj) {
  if (!myTag) {
    return false;
  }

  const isDuplicate = ALL_EXPORT_TAG_VALUES["analysis"].includes(myTag?.value || "");
  if (myTag) {
    ALL_EXPORT_TAG_VALUES[entity].push(myTag.value);
  }

  return isDuplicate;
}

async function enterExportName(entityType: EntityType, entityName: string) {
  const bracketRegex = new RegExp("[(.*?)]", "g");
  const autoValue = (name: string) => name.toLowerCase().replaceAll(" ", "_").replaceAll(bracketRegex, "");

  const { exportTag } = await prompts({
    message: `Enter a export value for the ${entityType} ${kleur.cyan(entityName)}`,
    name: "exportTag",
    type: "text",
    initial: autoValue(entityName),
  });

  return exportTag;
}

function getColoredEntityName(isDuplicate: boolean, name: string, tag?: TagsObj) {
  if (!tag) {
    return name;
  }

  const tagValue = isDuplicate ? kleur.red(tag.value) : kleur.green(tag.value);
  return `${name} [${tagValue}]`;
}

function getUpdatedTagList(tagList: TagsObj[], exportTag: string, exportValue: string) {
  const myTag = tagList.find((tag) => tag.key === exportTag);
  if (!myTag) {
    tagList.push({ key: exportTag, value: exportValue });
  } else {
    myTag.value = exportValue;
  }

  return tagList;
}
interface IUpdateEntitySetting {
  exportTag: string;
  entity: EntityType;
  entityItemList: any[];
  nameField: string;
  editFunction: (id: string, tags: TagsObj[]) => Promise<any>;
}

async function updateEntitySetting({ exportTag, entity, entityItemList, nameField, editFunction }: IUpdateEntitySetting) {
  const analysisListWithTag = entityItemList.map((x) => {
    const myTag = x.tags?.find((tag: TagsObj) => tag.key === exportTag);
    const isDuplicate = isDuplicateAndUpdateTagList(entity, myTag);

    return {
      title: getColoredEntityName(isDuplicate, x[nameField], myTag),
      value: x,
    };
  });

  const { choices } = await prompts({
    message: `Choose the ${entity} you want to configure for exporting`,
    name: "choices",
    type: "autocompleteMultiselect",
    choices: analysisListWithTag,
  });

  if (!choices) {
    errorHandler("Stopped");
    return;
  }

  if (choices.length === 0) {
    return;
  }

  for (const item of choices || []) {
    if (!item.tags) {
      continue;
    }

    const exportValue = await enterExportName("analysis", item[nameField]);
    if (!exportValue) {
      process.exit(0);
    }

    const tags = getUpdatedTagList(item.tags, exportTag, exportValue);
    await editFunction(item.id, tags);
  }

  successMSG(`${choices.length} ${entity} succesfully updated`);
}

async function setupExport(options: { setup: string }) {
  infoMSG("Setting up export");
  const config = getEnvironmentConfig(options.setup);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });

  const exportTag = await enterExportTag("export_id");
  const entities = await chooseEntities([], ["dictionaries", "run"]);
  for (const entity of entities) {
    if (entity === "dashboards") {
      const entityItemList = await account.dashboards.list({ amount: 35, fields: ["id", "label", "tags"] }).catch(errorHandler);
      if (!entityItemList) {
        return;
      }
      const editFunction = (id: string, tags: TagsObj[]) => account.dashboards.edit(id, { tags });
      await updateEntitySetting({ editFunction, entity: "dashboards", entityItemList, exportTag, nameField: "label" });
    }
    if (entity === "access") {
      const entityItemList = await account.accessManagement.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
      if (!entityItemList) {
        return;
      }
      const editFunction = (id: string, tags: TagsObj[]) => account.accessManagement.edit(id, { tags });
      await updateEntitySetting({ editFunction, entity: "access", entityItemList, exportTag, nameField: "name" });
    }
    if (entity === "actions") {
      const entityItemList = await account.actions.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
      if (!entityItemList) {
        return;
      }
      const editFunction = (id: string, tags: TagsObj[]) => account.actions.edit(id, { tags });
      await updateEntitySetting({ editFunction, entity: "actions", entityItemList, exportTag, nameField: "name" });
    }
    if (entity === "analysis") {
      const entityItemList = await account.analysis.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
      if (!entityItemList) {
        return;
      }
      const editFunction = (id: string, tags: TagsObj[]) => account.analysis.edit(id, { tags });
      await updateEntitySetting({ editFunction, entity: "analysis", entityItemList, exportTag, nameField: "name" });
    }
    if (entity === "devices") {
      const entityItemList = await account.devices.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
      if (!entityItemList) {
        return;
      }
      const editFunction = (id: string, tags: TagsObj[]) => account.devices.edit(id, { tags });
      await updateEntitySetting({ editFunction, entity: "devices", entityItemList, exportTag, nameField: "name" });
    }
    if (entity === "run") {
      infoMSG("Skipping run, it is not configurable.");
    }
    if (entity === "dictionaries") {
      infoMSG("Skipping dictionaries, it is not configurable.");
    }
  }
}

export { setupExport };
