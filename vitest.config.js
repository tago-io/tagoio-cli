import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./src",
    exclude: ["build/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      exclude: [
        "build/**",
        "node_modules/**",
        "test-utils/**",
        "**/*.test.ts",
        "**/*.d.ts",
        "**/mock/**",
        "**/*.json",
        // Entry point: integration glue, not unit-testable; runtime behaviour
        // is exercised by every live invocation.
        "index.ts",
        // Interactive prompt-driven flows. Unit-testing each prompt branch
        // would test the prompts library, not our logic. These commands are
        // covered by manual smokes (see docs/pr-30-test-plan.md sections
        // T-2.init and T-6.backup.restore).
        "commands/start-config.ts",
        "commands/profile/backup/restore.ts",
        "commands/profile/export/export-setup.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
