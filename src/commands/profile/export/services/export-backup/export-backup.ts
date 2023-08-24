import { writeFileSync } from "fs";

import { WidgetInfo } from "@tago-io/sdk/lib/types";

import { ensureDirectoryExistence } from "../../../../../lib/dotenv-config";
import { getCurrentFolder } from "../../../../../lib/get-current-folder";
import { EntityType } from "../../types";

const BKP_FILE_PATH = `${getCurrentFolder()}/exportBackup` as const;

async function storeExportBackup(source: "original" | "target", entity: EntityType | "widgets", json?: any) {
  if (!json) {
    return;
  }

  let path = `${BKP_FILE_PATH}/${source}/${entity}`;
  if (entity === "widgets") {
    path = `${BKP_FILE_PATH}/${source}/dashboards/${(json as WidgetInfo).dashboard}/widgets`;
  }

  const idOrNameOrLabel =
    json.id ||
    String(json.name || json.label || "undefined")
      .replaceAll(" ", "")
      .toLowerCase();

  // use writeFileSync to store the json in a file under bkp/entity folder (e.g. exportBackup/dashboards/...), making sure to create the folder if it doesn't exist and the file if it doesn't exist
  ensureDirectoryExistence(`${path}/${idOrNameOrLabel}.json`);
  writeFileSync(`${path}/${idOrNameOrLabel}.json`, JSON.stringify(json, null, 2));
}

export { storeExportBackup };
