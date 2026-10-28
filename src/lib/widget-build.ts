import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Message, Plugin } from "esbuild";

interface BuildParams {
  /** Folder holding tagoconfig.json; the other paths resolve against it. */
  projectRoot: string;
  widgetPath: string;
  buildPath: string;
  folder: string;
}

interface BuildResult {
  source: string;
  outFile: string;
  bytes: number;
}

interface Manifests {
  /** Package name to the import the platform should install, e.g. `npm:lucide-react@^0.562.0`. */
  specs: Map<string, string>;
  /** Deno import keys that map to a project file, resolved to an absolute path. */
  locals: Map<string, string>;
  /** Import keys whose value is not an `npm:` package, which the platform cannot install. */
  unsupported: Map<string, string>;
  /** Every package name any manifest mentions, dev-only ones included. */
  mentioned: Set<string>;
  files: string[];
}

const TAILWIND_PACKAGES = ["tailwindcss", "@tailwindcss/vite"];

/** The comment that opens a widget source to have the platform inject Tailwind; "// tailwind-merge" is not it. */
const TAILWIND_MARKER = /^\s*\/\/\s*tailwind(?![\w-])/i;

/** A widget folder is one plain path segment, so it can never point outside widgetPath. */
const FOLDER_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

const EMPTY_NAMESPACE = "tagoio-empty";

function isValidWidgetFolder(folder: string): boolean {
  return FOLDER_PATTERN.test(folder);
}

function readJSON(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`${path} is not valid JSON.`);
  }
}

function entries(value: unknown): [string, string][] {
  return value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    : [];
}

function readDenoImports(dir: string, manifests: Manifests): void {
  const deno = readJSON(join(dir, "deno.json"));
  if (!deno) {
    return;
  }
  manifests.files.push(join(dir, "deno.json"));
  for (const [key, value] of entries(deno.imports)) {
    // Prefix maps ("@std/" -> "...") cover whole folders, never one package to install.
    if (key.endsWith("/")) {
      continue;
    }
    manifests.mentioned.add(key);
    if (value.startsWith("npm:")) {
      manifests.specs.set(key, value);
    } else if (value.startsWith(".") || value.startsWith("/")) {
      manifests.locals.set(key, resolve(dir, value));
    } else {
      manifests.unsupported.set(key, value);
    }
  }
}

function readPackageDependencies(dir: string, manifests: Manifests): void {
  const pkg = readJSON(join(dir, "package.json"));
  if (!pkg) {
    return;
  }
  manifests.files.push(join(dir, "package.json"));
  for (const [name, range] of entries(pkg.dependencies)) {
    manifests.mentioned.add(name);
    if (range.startsWith("npm:")) {
      // An alias ("my-react": "npm:react@19") already names the package to install.
      manifests.specs.set(name, range);
    } else if (/^(workspace|file|link|git|https?):/.test(range)) {
      manifests.unsupported.set(name, range);
    } else {
      manifests.specs.set(name, `npm:${name}@${range}`);
    }
  }
  for (const [name] of entries(pkg.devDependencies)) {
    manifests.mentioned.add(name);
  }
}

/**
 * @description Collects package versions from `deno.json` imports and
 * `package.json` dependencies, from the least to the most specific folder, so
 * the manifest nearest to the importing file wins.
 *
 * Versions are passed to the platform as written. Probed: the bundler accepts a
 * range (`npm:lucide-react@^0.562.0`) without a warning, and only warns when no
 * version is given at all.
 */
function readManifests(dirs: string[]): Manifests {
  const manifests: Manifests = { specs: new Map(), locals: new Map(), unsupported: new Map(), mentioned: new Set(), files: [] };
  for (const dir of dirs) {
    readDenoImports(dir, manifests);
    readPackageDependencies(dir, manifests);
  }
  return manifests;
}

/** Every folder from the project root down to `dir`, so their manifests merge in that order. */
function manifestDirs(projectRoot: string, dir: string): string[] {
  const path = relative(projectRoot, dir);
  // Outside the project: on another drive `relative` returns an absolute path.
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
    return [dir];
  }
  const segments = path ? path.split(sep) : [];
  return [projectRoot, ...segments.map((_, index) => join(projectRoot, ...segments.slice(0, index + 1)))];
}

/**
 * @description Resolves manifests per importing folder, the way Deno and Node
 * do: a module in `shared/` uses the versions `shared/deno.json` declares, not
 * the widget's. Cached, since every import in a folder asks for the same chain.
 */
function manifestResolver(projectRoot: string): (dir: string) => Manifests {
  const cache = new Map<string, Manifests>();
  // esbuild hands over real paths, so the root is compared as one too (macOS
  // keeps temp and some home folders behind symlinks such as /var -> /private/var).
  const root = realpathSync(projectRoot);
  return (dir) => {
    const cached = cache.get(dir);
    if (cached) {
      return cached;
    }
    const manifests = readManifests(manifestDirs(root, existsSync(dir) ? realpathSync(dir) : dir));
    cache.set(dir, manifests);
    return manifests;
  };
}

/** Splits `@scope/pkg/sub/path` into the package name and the subpath (`/sub/path`). */
function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split("/");
  const size = specifier.startsWith("@") ? 2 : 1;
  return { name: parts.slice(0, size).join("/"), subpath: parts.length > size ? `/${parts.slice(size).join("/")}` : "" };
}

/**
 * @description Turns a package import into the `npm:` import the platform
 * installs. An exact manifest key wins (Deno maps `react/jsx-runtime` itself);
 * otherwise the package's version gets the subpath appended.
 */
function resolveSpecifier(specifier: string, manifests: Manifests): string {
  if (specifier.startsWith("npm:")) {
    return specifier;
  }
  const exact = manifests.specs.get(specifier);
  if (exact) {
    return exact;
  }
  const { name, subpath } = splitSpecifier(specifier);
  const base = manifests.specs.get(name);
  if (base) {
    return `${base}${subpath}`;
  }
  const unsupported = manifests.unsupported.get(specifier) ?? manifests.unsupported.get(name);
  if (unsupported) {
    throw new Error(`"${specifier}" maps to "${unsupported}", but the platform installs npm packages only.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
    throw new Error(`"${specifier}" cannot run in a widget: the platform installs npm packages only.`);
  }
  const where = manifests.files.length ? manifests.files.join(", ") : "no deno.json or package.json was found";
  throw new Error(`"${name}" is imported but not declared with a version (${where}). Add it to the widget's deno.json or package.json.`);
}

function formatBuildError(error: unknown): string {
  const failure = error as { errors?: Message[] };
  const first = failure.errors?.[0];
  if (!first) {
    return error instanceof Error ? error.message : String(error);
  }
  const at = first.location ? `${first.location.file}:${first.location.line}: ` : "";
  return `${at}${first.text}`;
}

/**
 * @description The esbuild plugin that decides what stays an import.
 *
 * A bare import is first offered to esbuild's own resolver, so project aliases
 * (tsconfig `paths`, package.json `imports`) still inline their local files.
 * Whatever does not resolve to a project file is a package: it stays an import,
 * pinned to its declared version. CSS, local or from a package, is dropped,
 * since the platform injects Tailwind itself.
 */
function importsPlugin(manifestsFor: (dir: string) => Manifests): Plugin {
  return {
    name: "tagoio-widget-imports",
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, async (args) => {
        if (args.kind === "entry-point" || (args.pluginData as { skip?: boolean } | undefined)?.skip) {
          return undefined;
        }
        const manifests = manifestsFor(args.resolveDir);
        const local = manifests.locals.get(args.path);
        if (local) {
          return { path: local };
        }
        if (args.path.endsWith(".css")) {
          return { path: args.path, namespace: EMPTY_NAMESPACE };
        }
        if (!args.path.startsWith("npm:")) {
          const resolved = await build.resolve(args.path, { resolveDir: args.resolveDir, kind: args.kind, pluginData: { skip: true } });
          if (!resolved.errors.length && !resolved.external && resolved.path && !resolved.path.split(sep).includes("node_modules")) {
            return { path: resolved.path };
          }
        }
        try {
          return { path: resolveSpecifier(args.path, manifests), external: true };
        } catch (error) {
          // Returned rather than thrown, so esbuild points at the import statement.
          return { errors: [{ text: error instanceof Error ? error.message : String(error) }] };
        }
      });
      build.onLoad({ filter: /.*/, namespace: EMPTY_NAMESPACE }, () => ({ contents: "", loader: "empty" }));
    },
  };
}

/**
 * @description Tells whether a local file in the bundle opens with the
 * `// tailwind` marker. esbuild drops ordinary comments, so a marker written in
 * App.tsx would otherwise never reach the uploaded file. Metafile inputs are
 * project-relative paths; entries from other namespaces (dropped CSS) are skipped.
 */
function hasTailwindMarker(projectRoot: string, inputs: string[]): boolean {
  return inputs.some((input) => {
    const file = resolve(projectRoot, input);
    return existsSync(file) && TAILWIND_MARKER.test(readFileSync(file, "utf8"));
  });
}

/**
 * @description Builds a widget folder into the single `.tsx` file the platform
 * bundles.
 *
 * The platform resolves `npm:` imports only, never another local file, so the
 * widget's local modules (and shared folders it imports) are inlined, while
 * each package stays an import pinned to the project's declared version. JSX is
 * kept: the platform compiles it, and its in-dashboard AI edits it.
 */
async function buildWidget(params: BuildParams): Promise<BuildResult> {
  if (!isValidWidgetFolder(params.folder)) {
    throw new Error(`"${params.folder}" is not a widget folder name: use one folder under widgetPath, such as "users-summary".`);
  }
  const widgetsRoot = resolve(params.projectRoot, params.widgetPath);
  const widgetDir = resolve(widgetsRoot, params.folder);
  const entry = join(widgetDir, "App.tsx");
  if (!existsSync(entry)) {
    throw new Error(`${params.folder}: ${entry} not found. A widget folder needs an App.tsx with a default export.`);
  }

  // Loaded here, not at the top: every CLI command imports this module, and
  // only a widget build needs esbuild's binary.
  const esbuild = await import("esbuild");
  const manifestsFor = manifestResolver(resolve(params.projectRoot));

  const bundled = await esbuild
    .build({
      entryPoints: [entry],
      // Module comments then read "// widgets/<folder>/App.tsx", relative to the project.
      absWorkingDir: resolve(params.projectRoot),
      bundle: true,
      write: false,
      metafile: true,
      outfile: "widget.js",
      format: "esm",
      target: "esnext",
      jsx: "preserve",
      charset: "utf8",
      logLevel: "silent",
      loader: { ".css": "empty" },
      plugins: [importsPlugin(manifestsFor)],
    })
    .catch((error: unknown) => {
      throw new Error(`${params.folder}: build failed: ${formatBuildError(error)}`);
    });

  // The metafile lists the real exports, which a text search cannot tell from
  // "export default" inside a string.
  const output = Object.values(bundled.metafile.outputs)[0];
  if (!output?.exports.includes("default")) {
    throw new Error(`${params.folder}: App.tsx has no default export. The platform renders the file's default export.`);
  }

  // The platform turns Tailwind on only when the word "tailwind" is in the source.
  const usesTailwind =
    TAILWIND_PACKAGES.some((name) => manifestsFor(widgetDir).mentioned.has(name)) ||
    hasTailwindMarker(params.projectRoot, Object.keys(bundled.metafile.inputs));
  const source = `${usesTailwind ? "// tailwind\n" : ""}${bundled.outputFiles[0].text}`;

  // A file that does not parse would fail on the platform, which keeps the previous build live.
  await esbuild.transform(source, { loader: "tsx", jsx: "automatic", target: "esnext" }).catch((error: unknown) => {
    throw new Error(`${params.folder}: the built file is not valid TSX: ${formatBuildError(error)}`);
  });

  const outFile = resolve(params.projectRoot, params.buildPath, "widgets", `${params.folder}.tsx`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, source, "utf8");

  return { source, outFile, bytes: Buffer.byteLength(source, "utf8") };
}

export { buildWidget, isValidWidgetFolder, manifestDirs, readManifests, resolveSpecifier, splitSpecifier };
export type { BuildParams, BuildResult, Manifests };
