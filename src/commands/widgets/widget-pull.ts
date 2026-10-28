import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { getApiURL, getEnvironmentConfig } from "../../lib/config-file.js";
import { readWidgetSource } from "../../lib/custom-widget-transport.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { requireLocalScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { isValidWidgetFolder } from "../../lib/widget-build.js";
import { selectEntries } from "./widget-deploy.js";

interface IOptions {
  environment?: string;
  all?: boolean;
  token?: string;
  silent?: boolean;
  json?: boolean;
}

interface PullResult {
  folder: string;
  widget_id: string;
  file?: string;
  bytes?: number;
  error?: string;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Downloads the source each placement currently runs into the
 * build folder, named `<folder>.<widget id>.published.tsx`, to compare with a
 * local build or to pick up an edit made in the Admin.
 *
 * Never into the widget folder: the published file is the single built file,
 * so writing it there would replace the folder's modules with their flattened
 * copy. Placements of one folder can differ (an Admin edit to one of them), so
 * each gets its own file.
 */
async function widgetPull(folderArg: string | undefined, options: IOptions) {
  const scope = requireLocalScope("widget-pull");
  printScopeBanner(scope, options.silent);

  const config = getEnvironmentConfig(options.environment);
  if (!config) {
    failWith("Environment not found", "env_not_found", options.json);
  }
  const token = options.token ?? config.profileToken;
  if (!token) {
    failWith("No profile token found. Pass --token or run 'tagoio login'.", "env_not_found", options.json);
  }

  const entries = await selectEntries(config.widgetList ?? [], folderArg, options);
  const transport = { apiURL: getApiURL(config.profileRegion), token };

  const results: PullResult[] = [];
  for (const entry of entries) {
    // The folder names the output file, so a value like "../x" in a cloned tagoconfig.json must not write elsewhere.
    if (!isValidWidgetFolder(entry.folder)) {
      results.push({ folder: entry.folder, widget_id: entry.widget_id, error: "not a widget folder name" });
      continue;
    }
    const source = await readWidgetSource(transport, { profileID: config.id, widgetID: entry.widget_id }).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (source === null || typeof source === "object") {
      results.push({
        folder: entry.folder,
        widget_id: entry.widget_id,
        error: source === null ? "no source uploaded yet, or this token cannot read it" : source.error,
      });
      continue;
    }
    const file = resolve(scope.root, config.buildPath || "./build", "widgets", `${entry.folder}.${entry.widget_id}.published.tsx`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source, "utf8");
    results.push({ folder: entry.folder, widget_id: entry.widget_id, file, bytes: Buffer.byteLength(source, "utf8") });
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(results)}\n`);
  } else {
    for (const result of results) {
      if (result.error) {
        infoMSG(`${result.folder} → widget ${result.widget_id}: ${result.error}`);
      } else {
        successMSG(`${result.folder} → ${result.file} (${result.bytes} bytes)`);
      }
    }
  }

  const failed = results.filter((result) => result.error);
  if (failed.length) {
    failWith(`${failed.length} of ${results.length} widget placement(s) could not be pulled.`, "pull_failed", options.json);
  }
}

export { widgetPull };
