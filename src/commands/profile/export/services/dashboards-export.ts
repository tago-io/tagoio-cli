import { queue } from "async";

import { Account } from "@tago-io/sdk";
import { DashboardInfo } from "@tago-io/sdk";

import { errorHandler } from "../../../../lib/messages";
import { chooseFromList } from "../../../../prompt/choose-from-list";
import { IExportOptions } from "../export";
import { IExportHolder } from "../types";
import { storeExportBackup } from "./export-backup/export-backup";
import { insertWidgets, removeAllWidgets } from "./widgets-export";

interface IQueue {
  label: string;
  dash_id: string;
  import_list: DashboardInfo[];
  export_holder: IExportHolder;
  importAccount: Account;
  exportAccount: Account;
}
async function updateDashboard({ label, dash_id, import_list, export_holder, exportAccount, importAccount }: IQueue) {
  console.info(`Exporting dashboard ${label}...`);
  const exportDash = await exportAccount.dashboards.info(dash_id).catch((error) => {
    throw `Error on dashboard ${label} in export account: ${error}`;
  });
  const export_id = exportDash.tags?.find((tag) => tag.key === export_holder.config.export_tag)?.value;
  if (!export_id) {
    return;
  }
  await storeExportBackup("original", "dashboards", exportDash);

  const importDash = await resolveDashboardTarget(importAccount, export_id, import_list, exportDash, export_holder);
  if (importDash.id === exportDash.id) {
    throw `Dashboard ${label} ID is the same as the export account`;
  }

  await storeExportBackup("target", "dashboards", importDash);

  await removeAllWidgets(importAccount, importDash).catch(errorHandler);
  importDash.arrangement = [];
  await insertWidgets(exportAccount, importAccount, exportDash, importDash, export_holder).catch(errorHandler);
  export_holder.dashboards[dash_id] = importDash.id;
}

async function resolveDashboardTarget(importAccount: Account, export_id: string, import_list: DashboardInfo[], content: DashboardInfo, export_holder: IExportHolder) {
  const import_dashboard = import_list.find((dash) => {
    const import_id = dash.tags?.find((tag) => tag.key === export_holder.config.export_tag)?.value;
    return import_id && import_id === export_id;
  });

  if (import_dashboard) {
    const importDashInfo = await importAccount.dashboards.info(import_dashboard.id).catch((error) => {
      throw `Error on dashboard ${import_dashboard.label} in import account: ${error}`;
    });

    const dashEditParams = {
      blueprint_device_behavior: content.blueprint_device_behavior,
      blueprint_devices: content.blueprint_devices,
      blueprint_selector_behavior: content.blueprint_selector_behavior,
      tabs: content.tabs,
      tags: content.tags,
      label: content.label,
    };

    await importAccount.dashboards.edit(importDashInfo.id, dashEditParams).catch((error) => {
      throw `Error on editing dashboard ${import_dashboard.label} in import account: ${error}`;
    });

    return { ...importDashInfo, ...dashEditParams };
  }

  const { dashboard: dashboard_id } = await importAccount.dashboards.create({ ...content, arrangement: undefined });
  await new Promise((resolve) => setTimeout(resolve, 350)); // sleep
  await importAccount.dashboards.edit(dashboard_id, { ...content, arrangement: undefined });

  return importAccount.dashboards.info(dashboard_id);
}

async function dashboardExport(exportAccount: Account, importAccount: Account, export_holder: IExportHolder, options: IExportOptions) {
  console.info("Exporting dashboard: started");

  // @ts-expect-error we are looking only for keys
  let exportList = await exportAccount.dashboards.list({ page: 1, amount: 10000, fields: ["id", "label", "tags"], filter: { tags: [{ key: export_holder.config.export_tag }] } });
  if (exportList.length > 0 && options.pick) {
    const choices = exportList.map((item) => ({ title: item.label, value: item }));
    exportList = await chooseFromList(choices, "Choose the dashboards you want to export:");
    if (!exportList) {
      exportList = [];
    }
  }

  // @ts-expect-error we are looking only for keys
  const import_list = await importAccount.dashboards.list({ page: 1, amount: 10000, fields: ["id", "label", "tags"], filter: { tags: [{ key: export_holder.config.export_tag }] } });

  const dashboardQueue = queue(updateDashboard, 3);
  dashboardQueue.error(errorHandler);

  for (const { id: dash_id, label } of exportList) {
    void dashboardQueue.push({ dash_id, label, import_list, importAccount, export_holder, exportAccount }).catch(null);
  }

  await dashboardQueue.drain();

  console.info("Exporting dashboard: finished");
  return export_holder;
}

export { dashboardExport };
