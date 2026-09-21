import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { buildPopulatedProgram, escapeRoff, generateManPage } from "./generate-man.js";

/**
 * @description Detects which man-page renderer is available on the host. CI
 * runners typically have `groff` (Linux); macOS has `mandoc` by default.
 * If neither is available, the integration test is skipped — the snapshot
 * test alone still catches drift in CI.
 */
function findManRenderer(): { bin: string; args: string[] } | null {
  const candidates: Array<{ bin: string; args: string[] }> = [
    { bin: "/usr/bin/mandoc", args: ["-Tutf8"] },
    { bin: "/usr/bin/groff", args: ["-mandoc", "-Tutf8"] },
    { bin: "groff", args: ["-mandoc", "-Tutf8"] },
    { bin: "mandoc", args: ["-Tutf8"] },
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate.bin, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

describe("generateManPage", () => {
  test("walks the populated program tree and emits the expected roff document", () => {
    const program = buildPopulatedProgram();
    const roff = generateManPage("3.2.0", program.commands);
    expect(roff).toMatchSnapshot();
  });

  test("escapeRoff escapes backslashes, hyphens, and leading periods", () => {
    expect(escapeRoff("plain")).toBe("plain");
    expect(escapeRoff("with\\backslash")).toBe("with\\\\backslash");
    expect(escapeRoff("--flag")).toBe("\\-\\-flag");
    expect(escapeRoff(".leading\nfine\n.line2")).toBe("\\&.leading\nfine\n\\&.line2");
  });

  test("the generated page exposes a stable command surface (regression guard)", () => {
    const program = buildPopulatedProgram();
    const roff = generateManPage("0.0.0", program.commands);

    // Sanity: a sampling of well-known commands must appear as section
    // sub-headings. Locks the contract that registerAllCommands is wired in
    // and the walker reaches every namespace.
    expect(roff).toContain(".SS init [environment]");
    expect(roff).toContain(".SS login [environment]");
    expect(roff).toContain(".SS analysis\\-deploy [name]");
    expect(roff).toContain(".SS device\\-list");
    expect(roff).toContain(".SS action\\-list");
    expect(roff).toContain(".SS dict\\-list");
    expect(roff).toContain(".SS secret\\-list");
    expect(roff).toContain(".SS run\\-user\\-list");
    expect(roff).toContain(".SS analysis\\-list");
    expect(roff).toContain(".SS access\\-management\\-list");
    expect(roff).toContain(".SS sql\\-list");
    expect(roff).toContain(".SS copy\\-tab [dashboardID]");

    // Two secret-* flags exist only to be refused with an explanation:
    // secret-create --silent (the value can only be typed) and secret-edit
    // --key (a key cannot be renamed). Undeclared, commander answers "unknown
    // option" and the explanation never reaches the user.
    //
    // Both assertions match the bold flag declaration rather than the prose,
    // because each command's help text mentions its flag while explaining the
    // refusal — a plain substring check would pass with the option missing.
    const sectionOf = (name: string) => roff.split(`.SS secret\\-${name}`)[1]?.split(".SS ")[0] ?? "";
    expect(sectionOf("create")).toContain("\\fB\\-\\-silent\\fR");
    expect(sectionOf("edit")).toContain("\\fB\\-\\-key\\fR");

    // Same class of flag on run-user-create: --silent is declared only so the
    // refusal can explain that the password has to be typed. Matched as a bold
    // declaration for the same reason as above — the help text mentions
    // --silent while explaining the refusal.
    const runUserSection = (name: string) => roff.split(`.SS run\\-user\\-${name}`)[1]?.split(".SS ")[0] ?? "";
    expect(runUserSection("create")).toContain("\\fB\\-\\-silent\\fR");

    // The analysis token authenticates as the analysis, so analysis-info hides it
    // behind an explicit opt-in. Matched as a bold declaration, not prose.
    const analysisSection = (name: string) => roff.split(`.SS analysis\\-${name}`)[1]?.split(".SS ")[0] ?? "";
    expect(analysisSection("info")).toContain("\\fB\\-\\-show\\-token\\fR");

    // The API accepts an `interval` field on an analysis, reports success and
    // silently discards it — scheduling actually lives in Actions. No flag may
    // exist for it: a declared option that cannot work is worse than none.
    expect(analysisSection("create")).not.toContain("\\fB\\-\\-interval\\fR");
    expect(analysisSection("edit")).not.toContain("\\fB\\-\\-interval\\fR");

    // --runtime exists on both, but means different things: on create it is a
    // plain field, on edit it re-uploads the script under a new language,
    // because that upload is what sets the runtime — probed, a PUT alone never
    // takes effect.
    expect(analysisSection("create")).toContain("\\fB\\-\\-runtime\\fR");
    expect(analysisSection("edit")).toContain("\\fB\\-\\-runtime\\fR");

    // These two match the alias as it appears in the commands' help EXAMPLES,
    // not as a registered alias: the man page never records aliases, since
    // generate-man.ts reads only cmd.name(). Deleting .alias("am-ls") would
    // leave both assertions green. What guards the aliases themselves is
    // alias-registry.test.ts, which asserts on the built program tree.
    //
    // They stay here because an example that stops mentioning the short form is
    // its own kind of regression — that is the line people copy.
    expect(roff).toContain("am\\-ls");
    expect(roff).toContain("sq\\-run");

    // --test on sql-execute is the only way to run a query without touching the
    // result cache, which matters when iterating on one. Matched as a bold flag
    // rather than prose, since the help text also mentions caching.
    const sqlSection = (name: string) => roff.split(`.SS sql\\-${name}`)[1]?.split(".SS ")[0] ?? "";
    expect(sqlSection("execute")).toContain("\\fB\\-\\-test\\fR");

    // Tags replace by default here, and run users carry access-granting tags,
    // so --merge-tags must stay reachable.
    expect(runUserSection("edit")).toContain("\\fB\\-\\-merge\\-tags\\fR");

    // No "Header" placeholder leaked through.
    expect(roff).not.toMatch(/\.SS [^\n]*Header/i);

    // No commander-internal `help` subcommand.
    expect(roff).not.toMatch(/^\.SS help[\s\n]/m);
  });

  test("integration: the generated page renders cleanly through the system man processor", () => {
    const renderer = findManRenderer();
    if (!renderer) {
      // Skip on hosts without groff/mandoc. Snapshot test still gates drift.
      return;
    }

    const program = buildPopulatedProgram();
    const roff = generateManPage("3.2.0", program.commands);

    const dir = mkdtempSync(join(tmpdir(), "tagoio-man-"));
    const path = join(dir, "tagoio.1");
    writeFileSync(path, roff, "utf8");

    // Renderer exits non-zero on roff syntax errors (.TP without a tag,
    // unclosed font escapes, etc.). We don't care about the rendered text;
    // the exit code is the gate.
    expect(() => execFileSync(renderer.bin, [...renderer.args, path], { stdio: "pipe" })).not.toThrow();
  });
});
