import { Resources } from "@tago-io/sdk";
import kleur from "kleur";
import prompts from "prompts";

import { getApiURL, getEnvironmentConfig, type IWidgetEntry } from "../../lib/config-file.js";
import { MAX_SOURCE_BYTES, type TransportContext, uploadWidgetSource } from "../../lib/custom-widget-transport.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { requireLocalScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { searchName } from "../../lib/search-name.js";
import { buildWidget, type BuildResult } from "../../lib/widget-build.js";
import { widgetPathOf } from "./widget-config.js";

interface IOptions {
  environment?: string;
  all?: boolean;
  dryRun?: boolean;
  token?: string;
  silent?: boolean;
  json?: boolean;
}

type DeployStatus = "deployed" | "built" | "build_failed" | "bundle_failed" | "rejected";

interface DeployResult {
  folder: string;
  dashboard_id: string;
  widget_id: string;
  status: DeployStatus;
  bytes?: number;
  warnings?: string[];
  error?: string;
}

interface DeployContext {
  resources: Resources;
  transport: TransportContext;
  projectRoot: string;
  widgetPath: string;
  buildPath: string;
  dryRun?: boolean;
}

/** Seconds to wait when a 429 carries no Retry-After: the upload limit is per minute. */
const DEFAULT_RETRY_SECONDS = 60;

/** A longer Retry-After fails the placement instead, so a CI run cannot stall on it. */
const MAX_RETRY_SECONDS = 120;

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Picks the placements to deploy: every placement of a folder by
 * its exact name, everything with `--all`, or a prompt over the folders. An
 * unknown folder names the closest one rather than guessing, since deploying
 * the wrong widget overwrites its source.
 */
async function selectEntries(list: IWidgetEntry[], folderArg: string | undefined, options: IOptions): Promise<IWidgetEntry[]> {
  if (!list.length) {
    failWith(
      "No widgets in this environment's widgetList. Link existing ones with 'widget-link', or create one with 'widget-create --folder <folder>'.",
      "no_widgets",
      options.json,
    );
  }
  if (options.all) {
    return list;
  }

  const folders = [...new Set(list.map((entry) => entry.folder))];
  if (folderArg) {
    const selected = list.filter((entry) => entry.folder === folderArg);
    if (!selected.length) {
      const closest = searchName(
        folderArg,
        folders.map((folder) => ({ names: [folder], value: folder })),
      );
      failWith(`No widget folder "${folderArg}" in widgetList. Did you mean "${closest}"?`, "not_found", options.json);
    }
    return selected;
  }

  if (options.silent) {
    failWith("Missing required input: folder (or --all)", "missing_input", options.json);
  }
  const { chosen } = await prompts({
    type: "autocompleteMultiselect",
    name: "chosen",
    message: "Which widget folders to deploy?",
    choices: folders.map((folder) => ({ title: folder, value: folder })),
  });
  if (!chosen?.length) {
    failWith("No widget selected.", "missing_input", options.json);
  }
  return list.filter((entry) => (chosen as string[]).includes(entry.folder));
}

/**
 * @description Uploads one placement's source, waiting out the per-minute
 * upload limit once. Refuses a widget that is not a custom widget, because an
 * upload rewires `display.url` on whatever widget the API accepts.
 */
async function publish(context: DeployContext, entry: IWidgetEntry, source: string): Promise<Omit<DeployResult, "folder" | "dashboard_id" | "widget_id">> {
  const widget = await context.resources.dashboards.widgets.info(entry.dashboard_id, entry.widget_id).catch((error: unknown) => {
    return { error: error instanceof Error ? error.message : String(error) };
  });
  if ("error" in widget) {
    return { status: "rejected", error: `widget not found: ${widget.error}` };
  }
  if (widget.type !== "iframe") {
    return { status: "rejected", error: `widget is a "${widget.type}" widget, not a custom widget` };
  }

  const params = { dashboardID: entry.dashboard_id, widgetID: entry.widget_id, source };
  // A timeout or dropped connection fails this placement only, so the others still deploy.
  const upload = () =>
    uploadWidgetSource(context.transport, params).catch((error: unknown) => ({
      kind: "request_error" as const,
      message: error instanceof Error ? error.message : String(error),
    }));

  let response = await upload();
  if (response.kind === "rate_limited") {
    const seconds = response.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS;
    if (seconds > MAX_RETRY_SECONDS) {
      return { status: "rejected", error: `upload limit reached; the API asks to wait ${seconds}s` };
    }
    infoMSG(`Upload limit reached; trying ${entry.folder} again in ${seconds}s.`);
    await new Promise((resolveWait) => setTimeout(resolveWait, seconds * 1000));
    response = await upload();
  }

  if (response.kind === "rate_limited") {
    return { status: "rejected", error: "upload limit reached twice; try again in a minute" };
  }
  if (response.kind === "request_error") {
    return { status: "rejected", error: response.message };
  }
  const { outcome } = response;
  if (!outcome.success) {
    return {
      status: "bundle_failed",
      warnings: outcome.warnings,
      error: `source saved but the bundle FAILED (${outcome.error ?? "no detail"}); the widget keeps rendering its previous build`,
    };
  }
  return { status: "deployed", warnings: outcome.warnings };
}

/**
 * @description Builds a folder and checks the platform's size cap, returning
 * the failure as a value so the caller can report it per placement.
 */
async function buildFolder(context: Pick<DeployContext, "projectRoot" | "widgetPath" | "buildPath">, folder: string): Promise<BuildResult | { error: string }> {
  const built = await buildWidget({ projectRoot: context.projectRoot, widgetPath: context.widgetPath, buildPath: context.buildPath, folder }).catch(
    (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
  );
  if (!("error" in built) && built.bytes > MAX_SOURCE_BYTES) {
    return { error: `the built source has ${built.bytes} bytes, over the ${MAX_SOURCE_BYTES} byte limit` };
  }
  return built;
}

/**
 * @description Builds each selected folder once and uploads it to every one of
 * its placements. Failures are collected rather than stopping the run, so one
 * broken widget does not hold back the others. A folder already built (by
 * `widget-create`, before it made the widget) is passed in `prebuilt`.
 */
async function deployEntries(context: DeployContext, entries: IWidgetEntry[], prebuilt?: Map<string, BuildResult>): Promise<DeployResult[]> {
  const results: DeployResult[] = [];
  const folders = [...new Set(entries.map((entry) => entry.folder))];

  for (const folder of folders) {
    const placements = entries.filter((entry) => entry.folder === folder);
    const built = prebuilt?.get(folder) ?? (await buildFolder(context, folder));
    if ("error" in built) {
      results.push(...placements.map((entry) => ({ ...entry, status: "build_failed" as const, error: built.error })));
      continue;
    }

    for (const entry of placements) {
      const outcome = context.dryRun ? { status: "built" as const } : await publish(context, entry, built.source);
      results.push({ ...entry, bytes: built.bytes, ...outcome });
    }
  }
  return results;
}

function reportResult(result: DeployResult): void {
  const target = `${result.folder} → widget ${result.widget_id}`;
  if (result.status === "deployed" || result.status === "built") {
    successMSG(`${target} (${result.bytes} bytes)${result.status === "built" ? " built, not uploaded (--dry-run)" : ""}`);
  } else {
    infoMSG(kleur.red(`${target}: ${result.status}: ${result.error}`));
  }
  for (const warning of result.warnings ?? []) {
    infoMSG(kleur.yellow(`  ${warning}`));
  }
}

async function widgetDeploy(folderArg: string | undefined, options: IOptions) {
  const scope = requireLocalScope("widget-deploy");
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
  const context: DeployContext = {
    resources: new Resources({ token, region: config.profileRegion }),
    transport: { apiURL: getApiURL(config.profileRegion), token },
    projectRoot: scope.root,
    widgetPath: widgetPathOf(config),
    buildPath: config.buildPath || "./build",
    dryRun: options.dryRun,
  };

  const results = await deployEntries(context, entries);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(results)}\n`);
  } else {
    results.forEach(reportResult);
  }

  const failed = results.filter((result) => result.status !== "deployed" && result.status !== "built");
  if (failed.length) {
    failWith(`${failed.length} of ${results.length} widget placement(s) failed.`, "deploy_failed", options.json);
  }
}

export { buildFolder, deployEntries, publish, selectEntries, widgetDeploy };
export type { DeployContext, DeployResult };
