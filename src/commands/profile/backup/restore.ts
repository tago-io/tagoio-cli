import { createReadStream, createWriteStream, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

import { Resources } from "@tago-io/sdk";
import axios from "axios";
import kleur from "kleur";
import ora from "ora";
import unzipper from "unzipper";

import { getEnvironmentConfig } from "../../../lib/config-file";
import { displayWarning } from "../../../lib/display-warning";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../../lib/messages";
import { chooseFromList } from "../../../prompt/choose-from-list";
import { confirmPrompt } from "../../../prompt/confirm";
import {
  fetchBackups,
  formatDate,
  formatFileSize,
  getDownloadUrl,
  handleBackupError,
  promptCredentials,
  selectBackup,
} from "./lib";
import { restoreAccessManagement } from "./resources/access-management";
import { restoreActions } from "./resources/actions";
import { restoreAnalysis } from "./resources/analysis";
import { restoreConnectors } from "./resources/connectors";
import { restoreDashboards } from "./resources/dashboards";
import { restoreDevices } from "./resources/devices";
import { restoreDictionaries } from "./resources/dictionaries";
import { restoreFiles } from "./resources/files";
import { restoreNetworks } from "./resources/networks";
import { restoreProfile } from "./resources/profile";
import { restoreRun } from "./resources/run";
import { restoreRunUsers } from "./resources/run-users";
import { restoreSecrets } from "./resources/secrets";
import { RestoreResult } from "./types";

interface RestoreOptions {
  resources?: boolean;
  items?: boolean;
}

interface BackupSummary {
  resource: string;
  count: number;
}

interface RestoreConfig {
  name: string;
  fn: (resources: Resources, extractDir: string, granularItem?: boolean) => Promise<RestoreResult>;
  format: (r: RestoreResult) => string;
}

const RESTORE_SEQUENCE: RestoreConfig[] = [
  { name: "Access Management", fn: restoreAccessManagement, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Actions", fn: restoreActions, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Analysis", fn: restoreAnalysis, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Connectors", fn: restoreConnectors, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Dashboards", fn: restoreDashboards, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Devices", fn: restoreDevices, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Dictionaries", fn: restoreDictionaries, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Networks", fn: restoreNetworks, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Profile", fn: restoreProfile, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Run", fn: restoreRun, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Run Users", fn: restoreRunUsers, format: (r) => `${r.created} created, ${r.updated} updated, ${r.failed} failed` },
  { name: "Files", fn: restoreFiles, format: (r) => `${r.created} uploaded, ${r.failed} failed` },
  { name: "Secrets", fn: restoreSecrets, format: (r) => `${r.created} created, ${r.updated} skipped, ${r.failed} failed` },
];

/** Warning messages for restore operation. */
const RESTORE_WARNING_MESSAGES = [
  { text: "IDs are NOT restored. New IDs will be generated for all resources.", bold: true },
  { text: "This means any external references to resource IDs will need to be updated.", bold: false },
];

/** Counts all files in a directory recursively. */
function countFilesInDirectory(dirPath: string): number {
  let count = 0;

  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);

    if (stat.isFile()) {
      count++;
    } else if (stat.isDirectory()) {
      count += countFilesInDirectory(entryPath);
    }
  }

  return count;
}

/** Parses a JSON file and returns the resource count. */
function parseJsonResource(filePath: string): number | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);
    return Array.isArray(data) ? data.length : 1;
  } catch {
    return null;
  }
}

/** Analyzes backup contents and returns resource counts. */
function analyzeBackupContents(extractDir: string): BackupSummary[] {
  const summary: BackupSummary[] = [];

  for (const entry of readdirSync(extractDir)) {
    const entryPath = join(extractDir, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      if (entry === "files") {
        const fileCount = countFilesInDirectory(entryPath);
        if (fileCount > 0) {
          summary.push({ resource: "files", count: fileCount });
        }
      } else {
        for (const subEntry of readdirSync(entryPath).filter((f) => f.endsWith(".json"))) {
          const count = parseJsonResource(join(entryPath, subEntry));
          if (count !== null) {
            summary.push({ resource: basename(subEntry, ".json"), count });
          }
        }
      }
    } else if (entry.endsWith(".json")) {
      const count = parseJsonResource(entryPath);
      if (count !== null) {
        summary.push({ resource: basename(entry, ".json"), count });
      }
    }
  }

  return summary.sort((a, b) => a.resource.localeCompare(b.resource));
}

/** Displays backup summary table with total resource count. Returns total count. */
function displayBackupSummary(summary: BackupSummary[]): number {
  const totalResources = summary.reduce((acc, item) => acc + item.count, 0);

  console.info("");
  console.info(kleur.bold("Backup Contents:"));
  console.info(kleur.gray("─".repeat(40)));

  console.table(summary.map((item) => ({ Resource: item.resource, Count: item.count })));

  infoMSG(`Total resources to restore: ${highlightMSG(totalResources.toString())}`);

  return totalResources;
}

/** Downloads and extracts backup to a temporary directory. */
async function downloadAndExtractBackup(downloadUrl: string, backupID: string): Promise<string> {
  const tempDir = join(tmpdir(), `tagoio-backup-${backupID}-${Date.now()}`);
  const zipPath = join(tempDir, "backup.zip");
  const extractDir = join(tempDir, "extracted");

  mkdirSync(tempDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });

  const spinner = ora("Downloading backup file...").start();
  const response = await axios.get(downloadUrl, { responseType: "stream" });
  await pipeline(response.data, createWriteStream(zipPath));
  spinner.succeed("Backup downloaded successfully.");

  spinner.start("Extracting backup contents...");
  await createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
  spinner.succeed("Backup extracted successfully.");

  return extractDir;
}

/** Prompts user to select which resources to restore. */
async function selectResourcesToRestore(): Promise<RestoreConfig[] | null> {
  const choices = RESTORE_SEQUENCE.map((config) => ({
    title: config.name,
    value: config.name,
  }));

  const selected = await chooseFromList(choices, "Select resources to restore:");

  if (!selected || selected.length === 0) {
    return null;
  }

  return RESTORE_SEQUENCE.filter((config) => selected.includes(config.name));
}

/** Interactive restore flow for profile backups. */
async function restoreBackup(options: RestoreOptions = {}) {
  const config = getEnvironmentConfig();
  if (!config?.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const profile = await resources.profiles.info("current").catch(errorHandler);
  if (!profile) {
    return;
  }

  const profileID = profile.info.id;
  const baseURL = typeof config.profileRegion === "object" ? config.profileRegion.api : "https://api.tago.io";

  infoMSG("Fetching available backups...\n");

  try {
    const backups = await fetchBackups(profileID, baseURL, config.profileToken);
    const selectedBackup = await selectBackup(backups, "restore");
    if (!selectedBackup) {
      return;
    }

    successMSG(`Selected backup: ${highlightMSG(selectedBackup.id)}`);
    infoMSG(`Created at: ${formatDate(selectedBackup.created_at)}`);
    infoMSG(`Size: ${formatFileSize(selectedBackup.file_size)}`);

    displayWarning(RESTORE_WARNING_MESSAGES);

    if (!(await confirmPrompt("Do you want to proceed with the restoration?"))) {
      infoMSG("Restoration cancelled by user.");
      return;
    }

    console.info("");
    infoMSG("Authentication required to download the backup.\n");

    const credentials = await promptCredentials();
    if (!credentials) {
      return;
    }

    successMSG("Credentials received.");
    console.info("");

    infoMSG("Requesting backup download URL...");
    const downloadResult = await getDownloadUrl(profileID, selectedBackup.id, baseURL, config.profileToken, credentials);
    infoMSG(`Backup size: ${highlightMSG(downloadResult.fileSizeMb + " MB")}`);
    infoMSG(`Download expires at: ${highlightMSG(formatDate(downloadResult.expireAt))}`);
    successMSG("Download URL obtained.");
    console.info("");

    const extractDir = await downloadAndExtractBackup(downloadResult.url, selectedBackup.id);
    console.info("");

    const summary = analyzeBackupContents(extractDir);
    if (summary.length === 0) {
      errorHandler("No valid resources found in the backup.");
      return;
    }

    const totalResources = displayBackupSummary(summary);

    if (totalResources > 1000) {
      displayWarning([
        { text: "This backup contains a large number of resources.", bold: true },
        { text: "The restoration process may take several minutes to complete.", bold: false },
      ]);
    }

    let restoreSequence = RESTORE_SEQUENCE;
    const isGranularItem = !!options.items;

    if (options.resources || options.items) {
      console.info("");
      const selectedResources = await selectResourcesToRestore();
      if (!selectedResources || selectedResources.length === 0) {
        infoMSG("No resources selected. Restoration cancelled.");
        return;
      }
      restoreSequence = selectedResources;
      infoMSG(`Selected ${highlightMSG(restoreSequence.length.toString())} resource types to restore.`);
    }

    if (!(await confirmPrompt("Do you want to restore these resources to your profile?"))) {
      infoMSG("Restoration cancelled by user.");
      return;
    }

    console.info("");
    infoMSG("Starting resource restoration...\n");

    const results: { config: RestoreConfig; result: RestoreResult }[] = [];

    for (const restoreConfig of restoreSequence) {
      const result = await restoreConfig.fn(resources, extractDir, isGranularItem);
      results.push({ config: restoreConfig, result });
      console.info("");
    }

    successMSG("Restoration completed!");
    for (const { config, result } of results) {
      infoMSG(`${config.name}: ${config.format(result)}`);
    }

    const tempDir = dirname(extractDir);
    rmSync(tempDir, { recursive: true, force: true });
    infoMSG("Temporary files cleaned up.");
  } catch (error) {
    handleBackupError(error, "Failed to restore backup");
  }
}

export { restoreBackup };
