// ? ==================================== (c) TagoIO ====================================
// ? What is this file?
// * This file is global types, it's used to remove "implicitly has an 'any' type" errors.
// ? ====================================================================================

import { GenericModuleParams } from "@tago-io/sdk";

interface IExportHolder {
  dashboards: { [key: string]: string };
  devices: { [key: string]: string };
  analysis: { [key: string]: string };
  tokens: { [key: string]: string };
  config: { export_tag: string };
}

type Entity = "dashboards" | "devices" | "analysis";
type EntityType = "dashboards" | "devices" | "run" | "analysis" | "actions" | "dictionaries" | "access";
interface IExport {
  export_tag: string;
  entities: EntityType[];
  dictionary?: string[];
  data?: string[];
  export: {
    token: string;
    region: GenericModuleParams["region"];
  };
  import: {
    token: string;
    region: GenericModuleParams["region"];
  };
}
const ENTITY_ORDER: EntityType[] = ["devices", "analysis", "dashboards", "access", "run", "actions", "dictionaries"];

export { EntityType, Entity, IExport, IExportHolder, ENTITY_ORDER };
