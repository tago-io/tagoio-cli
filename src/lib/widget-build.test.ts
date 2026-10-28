import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { buildWidget, manifestDirs, resolveSpecifier, splitSpecifier } from "./widget-build.js";

let root: string;

function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const BUILD = { widgetPath: "./widgets", buildPath: "./build" };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "widget-build-"));
  write("widgets/deno.json", JSON.stringify({ imports: { react: "npm:react@19.2.3", tailwindcss: "npm:tailwindcss@^4.3.3" } }));
  write("widgets/shared/deno.json", JSON.stringify({ imports: { luxon: "npm:luxon@3.7.2" } }));
  write("widgets/shared/when.ts", 'import { DateTime } from "luxon";\nexport const when = () => DateTime.now().toISO();\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildWidget", () => {
  test("inlines local modules and pins each package to the nearest manifest's version", async () => {
    write("widgets/clock/deno.json", JSON.stringify({ imports: { "lucide-react": "npm:lucide-react@^0.562.0" } }));
    write(
      "widgets/clock/App.tsx",
      [
        'import { useState } from "react";',
        'import { Bell } from "lucide-react";',
        'import { when } from "../shared/when.ts";',
        'import "./styles.css";',
        "export default function App() { const [t] = useState(when()); return <div><Bell />{t}</div>; }",
      ].join("\n"),
    );
    write("widgets/clock/styles.css", "@import 'tailwindcss';");

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "clock" });

    expect(result.source.startsWith("// tailwind\n")).toBe(true);
    expect(result.source).toContain('from "npm:react@19.2.3"');
    expect(result.source).toContain('from "npm:lucide-react@^0.562.0"');
    // luxon is imported from shared/, so shared/deno.json supplies its version.
    expect(result.source).toContain('from "npm:luxon@3.7.2"');
    expect(result.source).toContain("// widgets/shared/when.ts");
    expect(result.source).toContain("<Bell />");
    expect(result.source).not.toContain("styles.css");
    expect(readFileSync(result.outFile, "utf8")).toBe(result.source);
    expect(result.outFile).toBe(join(root, "build", "widgets", "clock.tsx"));
  });

  test("an undeclared package fails the build at the import that uses it", async () => {
    write("widgets/clock/App.tsx", 'import { Bell } from "lucide-react";\nexport default function App() { return <Bell />; }\n');

    await expect(buildWidget({ projectRoot: root, ...BUILD, folder: "clock" })).rejects.toThrow(
      /widgets\/clock\/App.tsx:1: "lucide-react" is imported but not declared/,
    );
  });

  test("a widget without a default export fails", async () => {
    write("widgets/clock/App.tsx", "export function App() { return <div />; }\n");

    await expect(buildWidget({ projectRoot: root, ...BUILD, folder: "clock" })).rejects.toThrow(/no default export/);
  });

  test("a folder without App.tsx fails before building", async () => {
    await expect(buildWidget({ projectRoot: root, ...BUILD, folder: "missing" })).rejects.toThrow(/App.tsx not found/);
  });

  test("project aliases inline their files: tsconfig paths and deno.json local imports", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["widgets/lib/*"] } } }));
    write("widgets/lib/greet.ts", "export const greet = () => 'hi';\n");
    write("widgets/clock/deno.json", JSON.stringify({ imports: { utils: "../lib/greet.ts" } }));
    write(
      "widgets/clock/App.tsx",
      'import { greet } from "@/greet.ts";\nimport { greet as again } from "utils";\nexport default function App() { return <b>{greet()}{again()}</b>; }\n',
    );

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "clock" });

    expect(result.source).toContain("// widgets/lib/greet.ts");
    expect(result.source).not.toMatch(/from "(@\/greet|utils)/);
  });

  test("a package's CSS import is dropped like a local one", async () => {
    write("widgets/map/deno.json", JSON.stringify({ imports: { leaflet: "npm:leaflet@1.9.4" } }));
    write(
      "widgets/map/App.tsx",
      'import "leaflet/dist/leaflet.css";\nimport L from "leaflet";\nexport default function App() { return <div>{String(L)}</div>; }\n',
    );

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "map" });

    expect(result.source).not.toContain(".css");
    expect(result.source).toContain('from "npm:leaflet@1.9.4"');
  });

  test("an export default inside a string does not count as one", async () => {
    write("widgets/clock/App.tsx", "const s = `\nexport default fake`;\nexport function App() { return <div>{s}</div>; }\n");

    await expect(buildWidget({ projectRoot: root, ...BUILD, folder: "clock" })).rejects.toThrow(/no default export/);
  });

  test("a folder name that leaves widgetPath is refused", async () => {
    await expect(buildWidget({ projectRoot: root, ...BUILD, folder: "../outside" })).rejects.toThrow(/not a widget folder name/);
  });

  test("a // tailwind marker in App.tsx survives the bundle without a tailwind package", async () => {
    rmSync(join(root, "widgets/deno.json"));
    write("widgets/table/deno.json", JSON.stringify({ imports: { react: "npm:react@19.2.3" } }));
    write("widgets/table/App.tsx", '// tailwind\n//\n// Customer list.\nexport default function App() { return <div className="flex gap-1" />; }\n');

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "table" });

    expect(result.source.startsWith("// tailwind\n")).toBe(true);
  });

  test("a // tailwind marker in an imported local module counts too", async () => {
    rmSync(join(root, "widgets/deno.json"));
    write("widgets/table/deno.json", JSON.stringify({ imports: { react: "npm:react@19.2.3" } }));
    write("widgets/table/row.tsx", '// Tailwind\nexport const Row = () => <div className="p-2" />;\n');
    write("widgets/table/App.tsx", 'import { Row } from "./row.tsx";\nexport default function App() { return <Row />; }\n');

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "table" });

    expect(result.source.startsWith("// tailwind\n")).toBe(true);
  });

  test("a tailwind comment further down the file, or tailwind-merge, is not the marker", async () => {
    rmSync(join(root, "widgets/deno.json"));
    write("widgets/table/deno.json", JSON.stringify({ imports: { react: "npm:react@19.2.3" } }));
    write("widgets/table/row.tsx", "// tailwind-merge is not used here\nexport const Row = () => <div />;\n");
    write("widgets/table/App.tsx", 'import { Row } from "./row.tsx";\n// Tailwind classes would go here\nexport default function App() { return <Row />; }\n');

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "table" });

    expect(result.source.startsWith("// tailwind\n")).toBe(false);
  });

  test("the word tailwind outside a line comment does not count as the marker", async () => {
    rmSync(join(root, "widgets/deno.json"));
    write("widgets/table/deno.json", JSON.stringify({ imports: { react: "npm:react@19.2.3" } }));
    write("widgets/table/App.tsx", 'const note = "no tailwind here";\nexport default function App() { return <p>{note}</p>; }\n');

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "table" });

    expect(result.source.startsWith("// tailwind\n")).toBe(false);
  });

  test("a package.json dependency pins the same way, and no tailwind leaves the marker out", async () => {
    rmSync(join(root, "widgets/deno.json"));
    write("widgets/plain/package.json", JSON.stringify({ dependencies: { react: "^19.2.3", "my-icons": "npm:lucide-react@0.562.0" } }));
    write(
      "widgets/plain/App.tsx",
      'import { useState } from "react";\nimport { Bell } from "my-icons";\nexport default function App() { useState(0); return <Bell />; }\n',
    );

    const result = await buildWidget({ projectRoot: root, ...BUILD, folder: "plain" });

    expect(result.source).toContain('from "npm:react@^19.2.3"');
    // An npm alias already names the package to install.
    expect(result.source).toContain('from "npm:lucide-react@0.562.0"');
    expect(result.source.startsWith("// tailwind")).toBe(false);
  });
});

describe("resolveSpecifier", () => {
  const manifests = {
    specs: new Map([
      ["react", "npm:react@19.2.3"],
      ["react/jsx-runtime", "npm:react@19.2.3/jsx-runtime"],
      ["@tago-io/custom-widget-react", "npm:@tago-io/custom-widget-react@2.2.0"],
    ]),
    locals: new Map<string, string>(),
    unsupported: new Map([["@std/path", "jsr:@std/path@1"]]),
    mentioned: new Set<string>(),
    files: ["deno.json"],
  };

  test("an exact key wins, otherwise the package version takes the subpath", () => {
    expect(resolveSpecifier("react/jsx-runtime", manifests)).toBe("npm:react@19.2.3/jsx-runtime");
    expect(resolveSpecifier("react/jsx-dev-runtime", manifests)).toBe("npm:react@19.2.3/jsx-dev-runtime");
    expect(resolveSpecifier("@tago-io/custom-widget-react", manifests)).toBe("npm:@tago-io/custom-widget-react@2.2.0");
    expect(resolveSpecifier("npm:x@1", manifests)).toBe("npm:x@1");
  });

  test("a non-npm mapping or a node: builtin is refused, since the platform installs npm packages only", () => {
    expect(() => resolveSpecifier("@std/path", manifests)).toThrow(/npm packages only/);
    expect(() => resolveSpecifier("node:fs", manifests)).toThrow(/"node:fs" cannot run in a widget/);
  });
});

describe("splitSpecifier", () => {
  test("keeps the scope with the package name", () => {
    expect(splitSpecifier("@tago-io/custom-widget-react/hooks")).toEqual({ name: "@tago-io/custom-widget-react", subpath: "/hooks" });
    expect(splitSpecifier("luxon")).toEqual({ name: "luxon", subpath: "" });
  });
});

describe("manifestDirs", () => {
  test("lists every folder from the project root down", () => {
    expect(manifestDirs("/p", "/p/widgets/clock")).toEqual(["/p", "/p/widgets", "/p/widgets/clock"]);
    expect(manifestDirs("/p", "/elsewhere")).toEqual(["/elsewhere"]);
    // A folder whose name starts with ".." is still inside the project.
    expect(manifestDirs("/p", "/p/..x")).toEqual(["/p", "/p/..x"]);
  });
});
