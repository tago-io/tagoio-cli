import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Account, AnalysisInfo, AnalysisListItem, GenericModuleParams } from "@tago-io/sdk";
import kleur from "kleur";
import prompts, { Choice } from "prompts";
import stringComparison from "string-comparison";
import { getConfigFile, IEnvironment, writeConfigFileEnv, writeToConfigFile } from "../lib/config-file.js";
import { detectInitState, InitState } from "../lib/init-state.js";
import { banner, endStep, failStep, overwriteConfirmCopy, startStep, summaryBlock } from "../lib/init-summary.js";
import { errorHandler, highlightMSG, infoMSG } from "../lib/messages.js";
import { globalConfigDir, setScopeOverride } from "../lib/resolve-scope.js";
import { readToken, writeToken } from "../lib/token.js";
import { promptTextToEnter } from "../prompt/text-prompt.js";
import { getTagoDeployURL, tagoLogin } from "./login.js";

const DEFAULT_ENV = "dev";
const DEFAULT_API_ENDPOINT = "https://api.tago.io";
const DEFAULT_SSE_ENDPOINT = "https://sse.tago.io";

interface ConfigOptions {
  /** Profile token; bypasses interactive login when set. */
  token?: string;
  /** Alias for the positional [environment] argument. Flag wins on conflict. */
  name?: string;
  /** Force local or global scope. Falls through to the decision tree if unset. */
  scope?: "local" | "global";
  /** API endpoint URL. Must be paired with `sseEndpoint`. */
  apiEndpoint?: string;
  /** SSE endpoint URL. Must be paired with `apiEndpoint`. */
  sseEndpoint?: string;
  /**
   * Commander stores `--no-input` as `input: false` (negation flag), with the
   * default being `true`. We normalize to a `noInput` boolean inside startConfig.
   */
  input?: boolean;
  /** Skip the existing-config overwrite confirmation. */
  force?: boolean;
}

interface AnalysisFile {
  filename: string;
  relativePath: string;
}

const analysisPath = "./src/analysis";

/** Recursively scans a directory for `.ts`/`.js` analysis files. */
function scanAnalysisFiles(dirPath: string, basePath: string = dirPath): AnalysisFile[] {
  const files: AnalysisFile[] = [];
  const items = readdirSync(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...scanAnalysisFiles(fullPath, basePath));
    } else if (item.endsWith(".ts") || item.endsWith(".js")) {
      const relativePath = dirPath === basePath ? "" : dirPath.replace(basePath + "/", "").replace(analysisPath + "/", "");
      files.push({ filename: item, relativePath });
    }
  }

  return files;
}

async function chooseAnalysis(analysisOptions: any[]) {
  const { response } = await prompts({
    type: "autocompleteMultiselect",
    limit: 20,
    choices: analysisOptions,
    message: "Which analysis to take?",
    name: "response",
  });
  return (response || []) as AnalysisInfo[];
}

async function getAnalysisList(account: Account, oldList: NonNullable<IEnvironment["analysisList"]> = []) {
  const analysisList = await account.analysis.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
  if (!analysisList) {
    return [];
  }

  const getName = (analysis: AnalysisListItem<"id" | "name" | "tags">) => `[${analysis.id}] ${analysis.name}`;
  const oldIDList = new Set(oldList.map((x) => x.id));
  const configList: AnalysisListItem<"id" | "name" | "tags">[] = analysisList.filter((x) => oldIDList.has(x.id));
  const analysisOptions = analysisList.map((x) => ({
    title: getName(x),
    selected: configList.some((y) => y.id === x.id),
    value: x,
  }));
  const response = await chooseAnalysis(analysisOptions);

  const formatFileName = (x: string) => x.toLowerCase().replace(" ", "-");
  return response.map((x) => ({
    fileName: formatFileName(x.name),
    name: x.name,
    id: x.id,
    ...oldList.find((old) => old.id === x.id),
  })) as NonNullable<IEnvironment["analysisList"]>;
}

async function getAnalysisScripts(analysisList: NonNullable<IEnvironment["analysisList"]>, analysisPathInput: string) {
  const cleaned = analysisPathInput.replace("./", "");
  if (!cleaned || !existsSync(cleaned)) {
    infoMSG(`Analysis folder not found at "${cleaned || "(empty)"}"; skipping file matching.`);
    return analysisList;
  }
  let files: Choice[] = scanAnalysisFiles(cleaned).map((x) => ({ title: x.filename, value: x.filename, description: x.relativePath }));

  for (const analysis of analysisList) {
    files = files.sort((a, b) =>
      stringComparison.cosine.distance(analysis.name, a.title) > stringComparison.cosine.distance(analysis.name, b.title) ? 1 : -1,
    );

    const editFile = files.find((x) => x.title === analysis.fileName);
    const { response } = await prompts({
      type: "autocomplete",
      limit: 20,
      choices: files.concat([{ title: "> Skip", value: ">skip-selector" }]),
      message: `Which analysis do you want to relate to ${highlightMSG(analysis.name)}`,
      name: "response",
      initial: editFile?.title,
    });

    if (response === ">skip-selector") {
      analysis.fileName = "";
      continue;
    }

    const file = files.find((x) => x.value === response);
    analysis.fileName = file?.title as string;
    if (file?.description && file.description.length > 0) {
      analysis.path = file.description;
    }
    const fileIndex = files.findIndex((x) => x.title === response);
    if (fileIndex !== -1) {
      files.splice(fileIndex, 1);
    }
  }
  return analysisList;
}

const SCHEMA_STUB = JSON.stringify({ $schema: "https://github.com/tago-io/tagoio-cli/blob/master/docs/schema.json" });

function bootstrapGlobalConfig(): void {
  const globalRoot = globalConfigDir();
  mkdirSync(globalRoot, { recursive: true, mode: 0o700 });
  setScopeOverride("global");
  const globalConfigPath = join(globalRoot, "tagoconfig.json");
  if (!existsSync(globalConfigPath)) {
    writeFileSync(globalConfigPath, SCHEMA_STUB, { encoding: "utf-8" });
  }
}

function bootstrapLocalConfig(): void {
  const localPath = join(process.cwd(), "tagoconfig.json");
  if (!existsSync(localPath)) {
    writeFileSync(localPath, SCHEMA_STUB, { encoding: "utf-8" });
  }
}

/**
 * @description Resolves the env name following the precedence:
 *   1. --name flag, 2. positional argument, 3. default "dev"
 * Emits a stderr note when the flag overrides the positional value.
 */
function resolveEnvName(positional: string | undefined, flag: string | undefined): string {
  if (flag && positional && flag !== positional) {
    infoMSG(`--name overrides positional environment '${positional}'`);
  }
  return flag || positional || DEFAULT_ENV;
}

/**
 * @description Step 1: existing-env handling. Either prompts to confirm
 * overwrite, hard-errors under --no-input, or returns silently when nothing
 * needs confirming.
 */
async function handleExistingEnv(state: InitState, envName: string, options: ConfigOptions): Promise<void> {
  if (!state.envExists || options.force) {
    return;
  }
  if ((options.input === false)) {
    errorHandler(
      `Configuration for env '${envName}' already exists at ${state.scope.configPath}. Pass --force to overwrite, or pick a different env name.`,
    );
  }
  process.stderr.write(`\n${overwriteConfirmCopy(state, envName)}\n\n`);
  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: "Overwrite existing configuration?",
    initial: false,
  });
  if (confirm !== true) {
    infoMSG("Cancelled. No changes made.");
    process.exit(0);
  }
}

/**
 * @description Resolves the target scope (Step 2). Honors --scope flag, then
 * the existing-config decision tree from #4. Bootstraps the stub config file
 * at the chosen scope so the rest of init has something to read/write.
 */
async function resolveTargetScope(options: ConfigOptions): Promise<void> {
  if (options.scope === "global") {
    bootstrapGlobalConfig();
    return;
  }
  if (options.scope === "local") {
    bootstrapLocalConfig();
    return;
  }
  // No flag: rely on the resolver. If neither config exists, prompt (or
  // default to local under --no-input).
  const initial = detectInitState("__probe__");
  if (initial.configExists) {
    return;
  }
  if ((options.input === false)) {
    bootstrapLocalConfig();
    return;
  }
  const { createGlobal } = await prompts({
    type: "confirm",
    name: "createGlobal",
    message: `No tagoconfig.json found in this directory or globally. Create a global configuration at ${globalConfigDir()}/tagoconfig.json?`,
    initial: false,
  });
  if (createGlobal) {
    bootstrapGlobalConfig();
  } else {
    bootstrapLocalConfig();
  }
}

/**
 * @description The init flow, restructured per clig.dev:
 *   Step 0: pre-flight detection (silent)
 *   Step 1: banner + overwrite confirm
 *   Step 2: resolve inputs (flag → positional → existing → default)
 *   Step 3: execute stages with [..]/[OK] progress markers
 *   Step 4: state-change summary block
 */
async function startConfig(positional: string, options: ConfigOptions = {}): Promise<void> {
  if (options.scope && options.scope !== "local" && options.scope !== "global") {
    errorHandler(`Invalid --scope value: '${options.scope}'. Use 'local' or 'global'.`);
  }

  const envName = resolveEnvName(positional, options.name);

  // Step 2 (early): bootstrap the chosen scope's tagoconfig.json. We need
  // this before detectInitState() so envExists/tokenExists reflect the
  // resolved scope and not the cwd-default fallback.
  await resolveTargetScope(options);

  // Step 0: pre-flight detection.
  const state = detectInitState(envName);

  // Step 1: banner + overwrite confirm.
  process.stderr.write(`${banner(state.scope)}\n`);
  await handleExistingEnv(state, envName, options);

  // Step 2 (continued): resolve token. --no-input requires -t.
  if ((options.input === false) && !options.token && !state.tokenExists) {
    errorHandler("--no-input requires --token <token> when no existing lock file is on disk for this env.");
  }

  const filesWritten: { path: string; description: string }[] = [];

  // Stage 1: project structure.
  startStep("Creating project structure");
  const configFile = getConfigFile();
  if (!configFile) {
    failStep("Creating project structure", "could not read or create tagoconfig.json");
    return;
  }
  endStep(`Created ${state.scope.configPath}`);
  filesWritten.push({ path: state.scope.configPath, description: "project configuration" });

  // Stage 2 + 3: authenticate + persist credentials.
  // --api-endpoint and --sse-endpoint must be passed together (or neither).
  // TagoIO Deploy installations have non-derivable subdomains, so we never
  // try to infer one from the other.
  if ((options.apiEndpoint && !options.sseEndpoint) || (!options.apiEndpoint && options.sseEndpoint)) {
    errorHandler("--api-endpoint and --sse-endpoint must both be set together (or neither).");
  }

  let token = options.token;
  let tagoAPIURL = options.apiEndpoint;
  let tagoSSEURL: string | undefined = options.sseEndpoint;

  if (!token) {
    token = readToken(envName);
  }
  if (!token) {
    if ((options.input === false)) {
      errorHandler("--no-input requires --token <token> for authentication.");
    }
    const data = await createEnvironmentToken(envName);
    token = data?.profileToken;
    tagoAPIURL = tagoAPIURL || data?.tagoDeployUrl;
    tagoSSEURL = tagoSSEURL || data?.tagoDeploySse;
  } else if (options.token) {
    // Token came from the flag. Persist it to the lock file.
    if (!(options.input === false) && !options.apiEndpoint) {
      const urlConfig = await getTagoDeployURL();
      tagoAPIURL = urlConfig?.urlAPI || tagoAPIURL;
      tagoSSEURL = urlConfig?.urlSSE || tagoSSEURL;
    }
    writeToken(token, envName);
    filesWritten.push({ path: `${state.scope.root}/.tago-lock.${envName}.lock`, description: "encrypted profile token" });
  } else {
    // Token already on disk; preserve URL settings from prior config.
    tagoAPIURL = tagoAPIURL || configFile[envName]?.tagoAPIURL;
    tagoSSEURL = tagoSSEURL || configFile[envName]?.tagoSSEURL;
  }

  if (!token) {
    infoMSG("Cancelled. No changes made.");
    return;
  }

  // Local-only prompts for analysis paths.
  if (state.scope.scope === "local") {
    if (!configFile.analysisPath && !(options.input === false)) {
      configFile.analysisPath = await promptTextToEnter(`Enter the path of your ${kleur.cyan("analysis")} folder: `, "./src/analysis");
    }
    if (!configFile.buildPath && !(options.input === false)) {
      configFile.buildPath = await promptTextToEnter(`Enter the path of your ${kleur.cyan("building")} folder (typescript): `, "./build");
    }
  }

  // API call to fetch profile metadata.
  startStep("Authenticating with TagoIO");
  let region: GenericModuleParams["region"] = "us-e1";
  if (tagoAPIURL) {
    region = { api: tagoAPIURL, sse: tagoSSEURL || "" };
  }
  const account = new Account({ token, region });
  let profile;
  let accountInfo;
  try {
    profile = await account.profiles.info("current");
    accountInfo = await account.info();
  } catch (err) {
    failStep("Authenticating with TagoIO", err);
    process.exit(1);
  }
  endStep(`Authenticated as ${profile.info.name}`);

  // Stage 4: build the new env block.
  const newEnv: IEnvironment = {
    id: profile.info.id,
    profileName: profile.info.name,
    email: accountInfo.email,
    tagoSSEURL,
    tagoAPIURL,
  };
  if (state.scope.scope === "local") {
    if ((options.input === false)) {
      // Non-interactive: preserve whatever analysisList is already on disk
      // (re-init keeps it; fresh init starts empty). The user can populate it
      // by editing tagoconfig.json or rerunning init interactively.
      newEnv.analysisList = configFile[envName]?.analysisList ?? [];
    } else {
      let analysisList = await getAnalysisList(account, configFile[envName]?.analysisList);
      analysisList = await getAnalysisScripts(analysisList, configFile.analysisPath);
      newEnv.analysisList = analysisList;
    }
  }
  startStep("Setting up environment");
  writeToConfigFile(configFile);
  writeConfigFileEnv(envName, newEnv);
  endStep("Environment ready");
  filesWritten.push({ path: state.scope.envFilePath, description: "active environment marker" });

  // Step 4: state-change summary.
  process.stderr.write(`\n${summaryBlock({
    filesWritten,
    scope: state.scope.scope,
    envName,
    profileName: profile.info.name,
    apiEndpoint: tagoAPIURL || DEFAULT_API_ENDPOINT,
    sseEndpoint: tagoSSEURL || DEFAULT_SSE_ENDPOINT,
  })}\n`);
}

/**
 * @description Helper used by interactive flows when no token is on disk and
 * the user has not passed `-t`. Prompts for the login flow.
 */
async function createEnvironmentToken(environment: string) {
  const { tryLogin } = await prompts({
    message: "Do you want to login and create a profile-token now?",
    type: "confirm",
    name: "tryLogin",
    hint: "Press N to enter a token later",
  });
  if (!tryLogin) {
    return;
  }
  infoMSG(`You can create a token by running: ${highlightMSG("tagoio login")}`);

  const opts = { token: undefined, tagoDeployUrl: undefined, tagoDeploySse: undefined };
  await tagoLogin(environment, opts);

  return {
    profileToken: opts.token,
    tagoDeployUrl: opts.tagoDeployUrl,
    tagoDeploySse: opts.tagoDeploySse,
  };
}

export { startConfig };
