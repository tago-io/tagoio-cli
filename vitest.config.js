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
