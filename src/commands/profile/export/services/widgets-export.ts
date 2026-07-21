import { Account, DashboardInfo, WidgetInfo } from "@tago-io/sdk";
import { queue } from "async";

import { errorHandler } from "../../../../lib/messages.js";
import { replaceObj } from "../../../../lib/replace-obj.js";
import { IExportHolder } from "../types.js";
import { storeExportBackup } from "./export-backup/export-backup.js";

type DashboardTabs = { type?: string; hidden?: boolean; key: string };
type WidgetArrangement = { tab?: string | null };
// The SDK declares Arrangement but does not export it; mirror the shape we read/write here.
type Arrangement = { widget_id: string; x: number; y: number; width: number; height: number; tab?: string | null };

/**
 * Orders widgets so the ones in hidden tabs are created first. A header button on a visible widget
 * references a hidden widget by id, and that reference is only remapped (via widgetIDMappings) if
 * the hidden widget already exists when the referencing widget is created. A tab is hidden when its
 * `type` is "hidden" (current shape) or its legacy `hidden` flag is true — live payloads carry both
 * consistently, so we accept either to stay robust against schema variation.
 */
function _sortHiddenWidgetsFirst<T extends WidgetArrangement>(arrangement: T[], tabs: DashboardTabs[]) {
  const hiddenTabKeys = new Set((tabs || []).filter((tab) => tab.type === "hidden" || tab.hidden === true).map((tab) => tab.key));
  const isHidden = (item: T) => Boolean(item.tab && hiddenTabKeys.has(item.tab));
  return [...arrangement].sort((a, b) => Number(isHidden(b)) - Number(isHidden(a)));
}

/**
 * Groups kept (preserved target) iframe arrangement entries by tab into FIFO queues. Source and
 * target share tab keys (the export copies the source tabs), so the Nth source iframe in a tab is
 * matched to the Nth kept target iframe in the same tab by shifting from its queue.
 */
function _groupKeptByTab(keptIframes: Arrangement[]) {
  const byTab = new Map<string | null | undefined, Arrangement[]>();
  for (const entry of keptIframes) {
    const list = byTab.get(entry.tab) ?? [];
    list.push(entry);
    byTab.set(entry.tab, list);
  }
  return byTab;
}

async function insertWidgets(
  exportAccount: Account,
  importAccount: Account,
  dashboard: DashboardInfo,
  target: DashboardInfo,
  export_holder: IExportHolder,
  ignoreCustomWidgets: boolean,
  keptIframes: Arrangement[] = [],
) {
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

  newWidgetQueue.error((error) => console.error(error));
  for (const widget_id of widget_ids || []) {
    newWidgetQueue.push(widget_id).catch(errorHandler);
  }

  await newWidgetQueue.drain();

  if (!dashboard.arrangement) {
    return;
  }
  const arrangement = _sortHiddenWidgetsFirst(dashboard.arrangement, dashboard.tabs as unknown as DashboardTabs[]);

  const new_arrangement: Arrangement[] = [];
  const widgetIDMappings: { [key: string]: string } = {};
  const keptByTab = _groupKeptByTab(keptIframes);
  for (const widget_arrangement of arrangement) {
    const widget = widgets.find((wdgt) => widget_arrangement.widget_id === wdgt.id);
    if (!widget || !widget.id) {
      continue;
    }

    // Custom widgets (type "iframe") carry source-only data (Files URL, analysis tokens) that the
    // ID remap cannot resolve. Instead of recreating from source, keep the target's reconfigured
    // widget and re-attach it with the source geometry (position/size). Matched by tab order.
    if (ignoreCustomWidgets && widget.type === "iframe") {
      const kept = keptByTab.get(widget_arrangement.tab)?.shift();
      if (kept) {
        new_arrangement.push({ ...widget_arrangement, widget_id: kept.widget_id });
      }
      continue;
    }

    const new_widget = replaceObj(widget, { ...export_holder.analysis, ...export_holder.devices, ...widgetIDMappings });
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

    widgetIDMappings[widget.id] = new_id;
    await new Promise((resolve) => setTimeout(resolve, 500)); // ? Prevent RPM limit issues
  }

  // Kept iframes with no matching source widget (target has more iframes than source) would be
  // orphaned by the arrangement overwrite below. Re-attach them with their own target geometry.
  for (const leftover of keptByTab.values()) {
    new_arrangement.push(...leftover);
  }

  await importAccount.dashboards.edit(target.id, { arrangement: new_arrangement });
}

/**
 * Deletes the target dashboard's widgets before they are recreated from the source. When
 * `ignoreCustomWidgets` is on, custom (iframe) widgets are kept instead of deleted so the user's
 * manual reconfiguration (Files URL, analysis tokens) survives. Returns the arrangement entries of
 * the kept widgets so the caller can re-attach them to the rebuilt arrangement.
 */
async function removeAllWidgets(importAccount: Account, dashboard: DashboardInfo, ignoreCustomWidgets: boolean) {
  if (!dashboard.arrangement || dashboard.arrangement?.length === 0) {
    return [];
  }

  // The queue runs at concurrency 5, so callbacks finish out of order. Tag each kept entry with its
  // arrangement index and sort by it before returning, so insertWidgets' positional shift() pairs
  // each source iframe to the target iframe in arrangement order — not task-completion order.
  const kept: { index: number; entry: Arrangement }[] = [];

  const widgetQueue = queue(async ({ entry, index }: { entry: Arrangement; index: number }) => {
    if (ignoreCustomWidgets) {
      const info = await importAccount.dashboards.widgets.info(dashboard.id, entry.widget_id).catch(() => null);
      if (info?.type === "iframe") {
        kept.push({ index, entry });
        await new Promise((resolve) => setTimeout(resolve, 50)); // sleep
        return;
      }
    }
    await importAccount.dashboards.widgets.delete(dashboard.id, entry.widget_id).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 50)); // sleep
  }, 5);

  widgetQueue.error(errorHandler);
  for (let index = 0; index < dashboard.arrangement.length; index++) {
    widgetQueue.push({ entry: dashboard.arrangement[index], index }).catch(errorHandler);
  }

  await widgetQueue.drain();
  return kept.sort((a, b) => a.index - b.index).map((k) => k.entry);
}

export { removeAllWidgets, insertWidgets };
export { _sortHiddenWidgetsFirst }; // exported for testing purposes
