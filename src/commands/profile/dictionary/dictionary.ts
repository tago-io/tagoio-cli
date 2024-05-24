import { all } from "axios";

import { Account } from "@tago-io/sdk";

import { editAutoDictionaryContent, IDictionaryContent } from "./edit-dictionary-content";
import { generateDictionaryKey } from "./generate-dictionary-key";
import { getDashboardDictionary } from "./get-dashboard-dictionary";
import { getAutoDictionaryID } from "./get-dictionary-id";
import { getWidgetInfo } from "./get-widget-info";
import { isDictionaryString } from "./is-dictionary-string";
import { removeDuplicatesAndEmptyStrings } from "./remove-strings";

async function dictionary() {
  const accountToken = "e6ac7f78-9fb9-43e9-ab1e-746b35d8c4b4";
  const account = new Account({ token: accountToken });

  const dashboardList = await account.dashboards.list();

  // const dictionaryContent: IDictionaryContent = {};
  // const dashboardDictionaryContent: IDictionaryContent = {};
  // const widgetDictionaryContent: IDictionaryContent = {};

  const allDashboardDictionaries: string[] = [];
  const allWidgetDictionaries: string[] = [];
  const allDictionaryContent: IDictionaryContent = {};

  for (const dashboard of dashboardList) {
    const dashboardInfo = await account.dashboards.info(dashboard.id);

    const { dashboardDictionaries } = await getDashboardDictionary(dashboardInfo, account);
    allDashboardDictionaries.push(...dashboardDictionaries);

    if (!dashboardInfo.arrangement) {
      console.log(`No arrangement found for dashboard ${dashboard.label}: ID-${dashboard.id}`);
      continue;
    }

    for (const widget of dashboardInfo.arrangement) {
      const widgetInfo = await getWidgetInfo(dashboard.id, widget.widget_id, accountToken);
      // console.log(`Widget ${widgetInfo.label} found in dashboard ${dashboard.label}: ID-${dashboard.id}`);
      console.dir(widgetInfo, { depth: null });

      

    // }
  }

  const dictionaries = [...allDashboardDictionaries, ...allWidgetDictionaries];
  const dictSet = removeDuplicatesAndEmptyStrings(dictionaries);
  console.dir(dictSet, { depth: null });

  for (const dict of dictSet) {
    const dictKey = generateDictionaryKey(dict);

    allDictionaryContent[dictKey] = dict;
  }

  const dictID = await getAutoDictionaryID(account);
  await editAutoDictionaryContent(account, dictID, allDictionaryContent);
}

dictionary().catch(console.error);
