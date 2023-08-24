import { queue } from "async";

import { Account } from "@tago-io/sdk";
import { DashboardInfo, WidgetInfo } from "@tago-io/sdk/lib/types";

import { errorHandler } from "../../../../lib/messages";
import { replaceObj } from "../../../../lib/replace-obj";
import { IExportHolder } from "../types";
import { storeExportBackup } from "./export-backup/export-backup";

async function insertWidgets(exportAccount: Account, importAccount: Account, dashboard: DashboardInfo, target: DashboardInfo, export_holder: IExportHolder) {
  const widget_ids = dashboard.arrangement?.map((x) => x.widget_id);

  const widgets: WidgetInfo[] = [];
  const newWidgetQueue = queue(async (widget_id: string) => {
    const info = await exportAccount.dashboards.widgets.info(dashboard.id, widget_id).catch((error) => {
      throw `Error on widget ${widget_id} from dashboard ${dashboard.label} in export account: ${error}`;
    });
    await storeExportBackup("original", "widgets", info);

    await new Promise((resolve) => setTimeout(resolve, 200)); // sleep

    if (info) {
      widgets.push(info);
    }
  }, 5);

  newWidgetQueue.error((error) => console.log(error));
  for (const x of widget_ids || []) {
    newWidgetQueue.push(x).catch(errorHandler);
  }

  await newWidgetQueue.drain();

  const hidden_tabs = new Set(dashboard.tabs.filter((tab: any) => !tab.hidden).map((tab: any) => tab.key));
  if (!dashboard.arrangement) {
    return;
  }
  const arrangement = dashboard.arrangement.sort((a) => (hidden_tabs.has(a.tab) ? 1 : -1));

  const new_arrangement: any = [];
  const widget_holder: { [key: string]: string } = {};
  for (const widget_arrangement of arrangement) {
    const widget = widgets.find((wdgt) => widget_arrangement.widget_id === wdgt.id);
    if (!widget || !widget.id) {
      continue;
    }

    const new_widget = replaceObj(widget, { ...export_holder.analysis, ...export_holder.devices, ...widget_holder });
    if (new_widget.data) {
      new_widget.data = new_widget.data.map((x: any) => {
        if (x.qty) {
          x.qty = Number(x.qty);
        }
        return x;
      });
    }

    const { widget: new_id } = await importAccount.dashboards.widgets.create(target.id, new_widget).catch((error) => {
      throw `Error on widget ${widget.id} from dashboard ${dashboard.label} in import account: ${error}`;
    });
    new_arrangement.push({ ...widget_arrangement, widget_id: new_id });

    widget_holder[widget.id] = new_id;
  }

  await importAccount.dashboards.edit(target.id, { arrangement: new_arrangement });
}

async function removeAllWidgets(importAccount: Account, dashboard: DashboardInfo) {
  if (!dashboard.arrangement || dashboard.arrangement?.length === 0) {
    return;
  }

  const widgetQueue = queue(async (widget_id: string) => {
    await importAccount.dashboards.widgets.delete(dashboard.id, widget_id).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 50)); // sleep
    return;
  }, 5);

  widgetQueue.error(errorHandler);
  for (const x of dashboard.arrangement) {
    widgetQueue.push(x.widget_id).catch(errorHandler);
  }

  await widgetQueue.drain();
}

export { removeAllWidgets, insertWidgets };
