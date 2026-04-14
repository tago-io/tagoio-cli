# TagoIO CLI Refactoring Specification

> Version: 1.0 | Status: Draft | Date: 2026-04-13

## 1. Objective

Refactor the TagoIO CLI (`@tago-io/cli`) to modernize the codebase, improve developer experience, and establish a solid foundation for future maintenance. The CLI serves TagoIO platform users (IoT developers, integrators, DevOps) who manage devices, analysis scripts, dashboards, and profile configurations from the terminal.

### Goals

1. **Migrate from CommonJS to ESM** — align with the Node.js ecosystem direction
2. **Bump to Node 24** — leverage native TypeScript execution via `--experimental-strip-types`
3. **Migrate tooling to OXC stack** — replace Biome with oxlint, use oxc-transform for build
4. **Standardize CLI output** — every mutating command must log what changed (IDs, serial numbers, names)
5. **Refactor error handling** — graceful failures with actionable messages and proper exit codes
6. **Achieve ~50% test coverage** — using Vitest with clear testing patterns
7. **Update all dependencies** — to current stable versions

### Non-Goals

- Switching away from Commander.js (it's the right tool, 25M+ weekly downloads)
- Switching away from Node.js runtime
- Rewriting business logic — only structural and quality improvements
- Adding new CLI commands or features

---

## 2. Current State Analysis

### 2.1 Codebase Overview

| Metric | Value |
|--------|-------|
| Source files | 88 TypeScript files |
| Test files | 4 files (~4.5% coverage) |
| Total LOC | ~7,868 |
| Module system | CommonJS |
| CLI framework | Commander.js v14.0.2 |
| Build | `tsc --build` (prod), `@swc-node/register` (dev) |
| Linter | Biome v2.1.4 |
| Test runner | Vitest v4.0.15 |
| Node requirement | >=20.0.0 |

### 2.2 Directory Structure (Current)

```
src/
├── index.ts                          # Entry point, command registration
├── commands/
│   ├── analysis/                     # 6 commands + 1 test
│   │   ├── index.ts                  # Command registration
│   │   ├── deploy.ts
│   │   ├── run-analysis.ts
│   │   ├── run-analysis.test.ts
│   │   ├── trigger-analysis.ts
│   │   ├── analysis-console.ts
│   │   ├── analysis-set-mode.ts
│   │   └── duplicate-analysis.ts
│   ├── devices/                      # 8 commands + 1 test
│   │   ├── index.ts
│   │   ├── device-list.ts
│   │   ├── device-info.ts
│   │   ├── device-bkp.ts
│   │   ├── device-live-inspector.ts
│   │   ├── change-network.ts
│   │   ├── change-bucket-type.ts
│   │   ├── data-get.ts
│   │   ├── data-get.test.ts
│   │   ├── data-post.ts
│   │   └── copy-data.ts
│   ├── dashboard/                    # 1 command
│   │   ├── index.ts
│   │   └── copy-tab.ts
│   ├── profile/
│   │   ├── index.ts
│   │   ├── export/                   # Export flow (7 service files + 2 tests)
│   │   └── backup/                   # Backup flow (4 commands + 12 resource files)
│   ├── login.ts
│   ├── start-config.ts
│   ├── set-env.ts
│   └── list-env.ts
├── lib/                              # 15 utility files
│   ├── config-file.ts
│   ├── token.ts
│   ├── messages.ts
│   ├── configure-help.ts
│   ├── notify-update.ts
│   └── ... (10 more)
└── prompt/                           # 15 prompt files
    ├── confirm.ts
    ├── pick-from-list.ts
    ├── text-prompt.ts
    └── ... (12 more)
```

### 2.3 Issues Identified

#### Module System
- **CJS throughout** — `tsconfig.json` targets `CommonJS`, `.swcrc` uses `commonjs`
- `__dirname` usage in `config-file.ts:resolveCLIPath()` — must be replaced with `import.meta` equivalents
- `readFileSync` + `JSON.parse` for `package.json` — should use `import` assertion or `createRequire`

#### Error Handling
- **`errorHandler()` calls `process.exit(0)`** — exits with code 0 (success) on errors (`messages.ts:9`)
- **No distinct exit codes** — all failures exit the same way
- **Errors swallowed silently** — e.g., `config-file.ts:63` catches errors with empty block
- **`errorHandler` used as `.catch()` callback** — e.g., `change-network.ts:56` passes `errorHandler` directly to `.catch()`, which receives an `Error` object but `errorHandler` expects a string
- **No error context** — messages like "Environment not found" don't tell the user what to do next

#### CLI Output
- **`change-network.ts` doesn't output device serial numbers** — as noted in the draft spec
- **No consistent output structure** — some commands use `successMSG`, others use `console.log` directly
- **No machine-readable output option** — no `--json` flag for scripting
- **`infoMSG` and `successMSG` both print `[INFO]`** — ambiguous prefix (`messages.ts:17-20`)

#### Testing
- **4 test files out of 88 source files** — ~4.5% file coverage
- **Only pure functions tested** — no command-level or integration tests
- **Exported test helpers use `_` prefix convention** — works but untested surface area is massive
- **No mocking patterns established** — SDK calls, prompts, and fs operations are untested

#### Tooling
- **Biome configured but rules are non-standard** — `recommended: false` with cherry-picked rules
- **Dual transpilers** — SWC for dev/test, TSC for build (unnecessary complexity)
- **Dead config** — `jest` config in `package.json` (line 37-41) is unused
- **`ts-node-dev`** in devDependencies but unused in scripts
- **`@swc/cli`** in dependencies (should be devDependency, if needed at all)

#### Code Quality
- **`any` types** — `messages.ts` accepts `any` for all parameters
- **Mixed import styles** — some use `node:` protocol, others don't
- **Lodash as full dependency** — only `cloneDeep` is used in tests

---

## 3. Target Architecture

### 3.1 Directory Structure (Post-Refactor)

```
src/
├── index.ts                          # Entry point (ESM, import.meta)
├── commands/
│   ├── analysis/
│   │   ├── index.ts                  # Command registration
│   │   ├── deploy.ts
│   │   ├── deploy.test.ts            # NEW: co-located test
│   │   └── ...
│   ├── devices/
│   ├── dashboard/
│   └── profile/
├── lib/
│   ├── config.ts                     # Renamed from config-file.ts
│   ├── token.ts
│   ├── output.ts                     # Replaces messages.ts — structured output
│   ├── errors.ts                     # NEW: error classes with exit codes
│   └── ...
└── prompt/
```

> Folder structure stays the same. No rearrangement — the current structure is already well-organized by domain.

### 3.2 Module System Migration (CJS -> ESM)

| Item | Before | After |
|------|--------|-------|
| `package.json` `type` | (absent, defaults to CJS) | `"type": "module"` |
| `tsconfig.json` `module` | `CommonJS` | `NodeNext` |
| `tsconfig.json` `moduleResolution` | `node` | `NodeNext` |
| Imports | `require()`, no extensions | `import`, explicit `.js` extensions |
| `__dirname` / `__filename` | Used in `config-file.ts` | `import.meta.dirname` / `import.meta.filename` (Node 21+) |
| `package.json` reading | `readFileSync` + `JSON.parse` | `createRequire` or static import with assert |
| `.swcrc` module type | `commonjs` | Remove `.swcrc` entirely |

### 3.3 Tooling Migration

| Tool | Before | After |
|------|--------|-------|
| Linter | Biome v2.1.4 | oxlint (OXC stack) |
| Formatter | Biome | oxc-format or Prettier (OXC ecosystem) |
| Build (prod) | `tsc --build` | `oxc-transform` or Node 24 native TS (`--experimental-strip-types`) |
| Build (dev) | `@swc-node/register` | Direct `node --experimental-strip-types ./src/index.ts` |
| Test runner | Vitest v4.0.15 | Vitest (keep — it's the best option) |
| Config | `biome.json` + `.swcrc` + `tsconfig.json` | `oxlint.json` + `tsconfig.json` |

### 3.4 Error Handling Design

#### Exit Codes

| Code | Meaning | Example |
|------|---------|---------|
| 0 | Success | Command completed |
| 1 | General error | Unexpected failure |
| 2 | Usage error | Missing required argument |
| 3 | Config error | Environment not found, no token |
| 4 | API error | TagoIO API returned error |
| 5 | Auth error | Invalid or expired token |

#### Error Classes

```typescript
// src/lib/errors.ts
export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
    public readonly hint?: string
  ) {
    super(message);
    this.name = "CLIError";
  }
}

export class ConfigError extends CLIError {
  constructor(message: string, hint?: string) {
    super(message, 3, hint);
    this.name = "ConfigError";
  }
}

export class APIError extends CLIError {
  constructor(message: string, hint?: string) {
    super(message, 4, hint);
    this.name = "APIError";
  }
}

export class AuthError extends CLIError {
  constructor(message: string) {
    super(message, 5, 'Run "tagoio login" to authenticate.');
    this.name = "AuthError";
  }
}
```

#### Error Handler (replaces `errorHandler`)

```typescript
// Centralized in index.ts or a top-level wrapper
function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(`[ERROR] ${error.message}`);
    if (error.hint) {
      console.error(`  Hint: ${error.hint}`);
    }
    process.exit(error.exitCode);
  }

  // Unexpected errors
  console.error(`[ERROR] Unexpected error: ${String(error)}`);
  process.exit(1);
}
```

### 3.5 Standardized Output

#### Output Module (replaces `messages.ts`)

```typescript
// src/lib/output.ts
export const output = {
  success(message: string): void {
    console.log(`[OK] ${kleur.green(message)}`);
  },
  info(message: string): void {
    console.log(`[INFO] ${kleur.blue(message)}`);
  },
  warn(message: string): void {
    console.warn(`[WARN] ${kleur.yellow(message)}`);
  },
  change(action: string, resource: string, details: Record<string, string>): void {
    // Structured output for mutations
    const detailStr = Object.entries(details)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(`[${kleur.cyan(action.toUpperCase())}] ${resource} ${kleur.dim(detailStr)}`);
  },
};
```

#### Output Rules

1. **Every mutating command** must call `output.change()` with: action (CREATE, UPDATE, DELETE), resource type, and identifying details (ID, name, serial number)
2. **Read-only commands** use `output.info()` or direct `console.log()`
3. **Prefixes are distinct**: `[OK]`, `[INFO]`, `[WARN]`, `[ERROR]` — no duplicates
4. **Colors degrade gracefully** — respect `NO_COLOR` env var (kleur already handles this)

#### Example: change-network command after refactor

```
[INFO] Using environment: production [Profile Name] [user@email.com]
[INFO] Device: Temperature Sensor - 64a1b2c3d4e5f6
[UPDATE] device id=64a1b2c3d4e5f6 serial=SN-001 network=62f1a2b3 connector=62f1a2b4
[OK] Device network and connector updated successfully.
```

---

## 4. Testing Strategy

### 4.1 Test Categories

| Category | Target Coverage | What to Test |
|----------|----------------|--------------|
| **Unit tests** | All pure functions in `lib/` and `prompt/` | Config parsing, token read/write, data filters, output formatting, error classes |
| **Command tests** | All 20+ commands | Each command's action handler with mocked SDK and prompts |
| **Integration tests** | Critical flows | init → login → deploy, backup create → restore |

### 4.2 Testing Patterns

#### Pattern 1: Pure Function Unit Tests (existing pattern, expand)

```typescript
// src/lib/errors.test.ts
import { describe, expect, it } from "vitest";
import { CLIError, ConfigError, AuthError } from "./errors.js";

describe("CLIError", () => {
  it("should set exit code and hint", () => {
    const error = new CLIError("something broke", 4, "try again");
    expect(error.message).toBe("something broke");
    expect(error.exitCode).toBe(4);
    expect(error.hint).toBe("try again");
  });
});

describe("AuthError", () => {
  it("should default to exit code 5 with login hint", () => {
    const error = new AuthError("token expired");
    expect(error.exitCode).toBe(5);
    expect(error.hint).toContain("tagoio login");
  });
});
```

#### Pattern 2: Command Tests (new pattern)

Mock the SDK, filesystem, and prompts at the module level. Test the command action handler directly.

```typescript
// src/commands/devices/change-network.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock SDK
vi.mock("@tago-io/sdk", () => ({
  Account: vi.fn().mockImplementation(() => ({
    devices: {
      info: vi.fn().mockResolvedValue({
        name: "TestDevice",
        network: "old-network",
        connector: "old-connector",
      }),
      tokenList: vi.fn().mockResolvedValue([
        { token: "tok-1", serie_number: "SN-001", name: "Default", permission: "full" },
      ]),
      tokenDelete: vi.fn().mockResolvedValue(undefined),
      tokenCreate: vi.fn().mockResolvedValue(undefined),
      edit: vi.fn().mockResolvedValue(undefined),
    },
  })),
}));

// Mock config
vi.mock("../../lib/config.js", () => ({
  getEnvironmentConfig: vi.fn().mockReturnValue({
    profileToken: "fake-token",
    profileRegion: "us-e1",
  }),
}));

// Mock prompts
vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: vi.fn().mockResolvedValue("device-123"),
}));

import { changeNetworkOrConnector } from "./change-network.js";

describe("changeNetworkOrConnector", () => {
  it("should update device network and connector", async () => {
    await changeNetworkOrConnector("device-123", {
      environment: "dev",
      networkID: "new-network",
      connectorID: "new-connector",
    });

    // Verify SDK calls were made correctly
    const { Account } = await import("@tago-io/sdk");
    const mockAccount = (Account as any).mock.results[0].value;
    expect(mockAccount.devices.edit).toHaveBeenCalledWith("device-123", {
      network: "new-network",
      connector: "new-connector",
      active: true,
    });
  });

  it("should throw ConfigError when environment not found", async () => {
    const { getEnvironmentConfig } = await import("../../lib/config.js");
    (getEnvironmentConfig as any).mockReturnValueOnce(undefined);

    await expect(
      changeNetworkOrConnector("device-123", {
        environment: "nonexistent",
        networkID: "net",
        connectorID: "conn",
      })
    ).rejects.toThrow("ConfigError");
  });
});
```

#### Pattern 3: Prompt Unit Tests (new pattern)

```typescript
// src/prompt/confirm.test.ts
import { describe, expect, it, vi } from "vitest";
import prompts from "prompts";

describe("confirmPrompt", () => {
  it("should return true when user confirms", async () => {
    prompts.inject([true]); // Simulate user input
    const { confirmPrompt } = await import("./confirm.js");
    const result = await confirmPrompt("Are you sure?");
    expect(result).toBe(true);
  });

  it("should return false when user declines", async () => {
    prompts.inject([false]);
    const { confirmPrompt } = await import("./confirm.js");
    const result = await confirmPrompt("Are you sure?");
    expect(result).toBe(false);
  });
});
```

#### Pattern 4: Output and Error Integration Tests

```typescript
// src/lib/output.test.ts
import { describe, expect, it, vi } from "vitest";

describe("output.change", () => {
  it("should log structured mutation output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { output } = await import("./output.js");

    output.change("update", "device", { id: "abc123", serial: "SN-001" });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE")
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("id=abc123")
    );
    spy.mockRestore();
  });
});
```

### 4.3 Files to Test (Priority Order)

#### Priority 1 — Lib (pure logic, highest ROI)

| File | Functions to Test | Est. Tests |
|------|-------------------|------------|
| `lib/errors.ts` | NEW: all error classes, handleError | 8 |
| `lib/output.ts` | NEW: success, info, warn, change | 6 |
| `lib/config-file.ts` | getConfigFile, getEnvironmentConfig, getProfileRegion, setDefault | 10 |
| `lib/token.ts` | readToken, writeToken | 6 |
| `lib/messages.ts` | (deprecated — tests for backward compat during migration) | 3 |
| `lib/search-name.ts` | searchName | 4 |
| `lib/compare.ts` | compare functions | 3 |
| `lib/add-https-to-url.ts` | addHttpsToUrl | 4 |
| `lib/add-to-gitignore.ts` | addOnGitIgnore | 3 |
| `lib/configure-help.ts` | configureHelp | 2 |
| `lib/commander-repeatable.ts` | cmdRepeatableValue | 3 |
| `lib/dotenv-config.ts` | env variable handling | 3 |
| `lib/current-runtime.ts` | detectRuntime | 3 |
| `lib/get-current-folder.ts` | getCurrentFolder | 2 |
| `lib/replace-obj.ts` | replaceObj | 4 |

**Subtotal: ~64 tests**

#### Priority 2 — Prompts (user interaction layer)

| File | Functions to Test | Est. Tests |
|------|-------------------|------------|
| `prompt/confirm.ts` | confirmPrompt | 2 |
| `prompt/pick-from-list.ts` | pickFromList | 3 |
| `prompt/text-prompt.ts` | promptTextToEnter | 3 |
| `prompt/number-prompt.ts` | numberPrompt | 3 |
| `prompt/date-prompt.ts` | datePrompt | 3 |
| `prompt/pick-environment.ts` | pickEnvironment | 3 |
| `prompt/choose-from-list.ts` | chooseFromList | 2 |
| `prompt/choose-analysis-list-config.ts` | chooseAnalysisListConfig | 2 |
| `prompt/pick-analysis-from-config.ts` | pickAnalysisFromConfig | 3 |
| `prompt/confirm-analysis-list.ts` | confirmAnalysisList | 2 |
| `prompt/pick-device-id-from-tagoio.ts` | pickDeviceIDFromTagoIO | 3 |
| `prompt/pick-dashboard-id-from-tagoio.ts` | pickDashboardIDFromTagoIO | 3 |
| `prompt/pick-analysis-from-tagoio.ts` | pickAnalysisFromTagoIO | 3 |
| `prompt/pick-files-from-tagoio.ts` | pickFilesFromTagoIO | 2 |
| `prompt/choose-analysis-from-tagoio.ts` | chooseAnalysisFromTagoIO | 2 |

**Subtotal: ~39 tests**

#### Priority 3 — Commands (integration level)

| File | What to Test | Est. Tests |
|------|-------------|------------|
| `commands/login.ts` | Auth flow with token storage | 4 |
| `commands/start-config.ts` | Config creation and update | 4 |
| `commands/set-env.ts` | Environment switching | 3 |
| `commands/list-env.ts` | Environment listing output | 2 |
| `commands/analysis/deploy.ts` | Analysis deploy flow | 5 |
| `commands/analysis/run-analysis.ts` | Run analysis (expand existing 7) | +3 |
| `commands/analysis/trigger-analysis.ts` | Trigger flow | 3 |
| `commands/analysis/analysis-console.ts` | Console streaming | 3 |
| `commands/analysis/analysis-set-mode.ts` | Mode switching | 3 |
| `commands/analysis/duplicate-analysis.ts` | Duplication flow | 3 |
| `commands/devices/device-list.ts` | List with filters | 4 |
| `commands/devices/device-info.ts` | Info display | 3 |
| `commands/devices/device-bkp.ts` | Backup flow | 4 |
| `commands/devices/device-live-inspector.ts` | SSE connection | 3 |
| `commands/devices/change-network.ts` | Network/connector change with serial output | 5 |
| `commands/devices/change-bucket-type.ts` | Bucket type change | 3 |
| `commands/devices/data-get.ts` | Data query (expand existing 2) | +3 |
| `commands/devices/data-post.ts` | Data posting | 3 |
| `commands/devices/copy-data.ts` | Data copy between devices | 4 |
| `commands/dashboard/copy-tab.ts` | Dashboard tab copy | 3 |
| `commands/profile/export/export.ts` | Full export flow | 5 |
| `commands/profile/backup/create.ts` | Backup creation | 4 |
| `commands/profile/backup/list.ts` | Backup listing | 2 |
| `commands/profile/backup/restore.ts` | Backup restoration | 5 |
| `commands/profile/backup/download.ts` | Backup download | 3 |

**Subtotal: ~88 tests**

#### Priority 4 — Export/Backup Services

| File | Est. Tests |
|------|------------|
| `profile/export/services/collect-ids.ts` | (expand existing) +3 |
| `profile/export/services/run-buttons-export.ts` | (expand existing) +2 |
| `profile/export/services/devices-export.ts` | 4 |
| `profile/export/services/dashboards-export.ts` | 4 |
| `profile/export/services/analysis-export.ts` | 4 |
| `profile/export/services/actions-export.ts` | 3 |
| `profile/export/services/access-export.ts` | 3 |
| `profile/export/services/widgets-export.ts` | 3 |
| `profile/export/services/dictionary-export.ts` | 3 |
| `profile/export/services/export-backup/export-backup.ts` | 4 |
| `profile/export/collect-ids.ts` | 3 |
| `profile/export/export-setup.ts` | 3 |
| `profile/backup/lib.ts` | 4 |
| `profile/backup/resources/*.ts` (12 files) | 24 |

**Subtotal: ~67 tests**

### 4.4 Coverage Summary

| Category | Est. Tests | Priority |
|----------|------------|----------|
| Lib (pure functions) | 64 | P1 |
| Prompts | 39 | P2 |
| Commands | 88 | P3 |
| Export/Backup Services | 67 | P4 |
| **Total** | **~258** | |

**Existing tests: 13 → Target: ~258+ tests → ~80% coverage**

### 4.5 Test Infrastructure

```typescript
// vitest.config.ts (post-refactor)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./src",
    exclude: ["build/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

### 4.6 Test Helpers to Create

```typescript
// src/test-utils/mock-sdk.ts
// Reusable factory for mocking @tago-io/sdk Account class

// src/test-utils/mock-config.ts
// Reusable factory for mocking getEnvironmentConfig

// src/test-utils/capture-output.ts
// Helper to capture console.log/error/warn output during tests
```

---

## 5. Code Style & Conventions

### 5.1 Post-Refactor Standards

| Rule | Standard |
|------|----------|
| Module system | ESM (`import`/`export`) |
| Import paths | Always use `node:` protocol for builtins, explicit `.js` extensions for local |
| Formatting | 2-space indent, LF line endings, 160 char line width (match current) |
| Types | Strict — no `any`. Replace all `any` in `messages.ts` and similar |
| Error handling | Throw `CLIError` subclasses, never call `process.exit()` directly in commands |
| Output | Use `output.*` functions, never raw `console.log` in commands |
| File naming | kebab-case (match current) |
| Test files | Co-located: `foo.test.ts` next to `foo.ts` |

### 5.2 Import Order (enforced by oxlint)

```typescript
// 1. Node builtins
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2. External packages
import { Account } from "@tago-io/sdk";
import { Command } from "commander";
import kleur from "kleur";

// 3. Internal modules
import { getEnvironmentConfig } from "../../lib/config.js";
import { output } from "../../lib/output.js";
```

---

## 6. Boundaries

### Always Do
- Exit with proper exit codes (0 = success, non-zero = specific failure type)
- Log all mutations to stdout with resource IDs and relevant identifiers
- Use typed errors (`CLIError` subclasses) — never throw raw strings
- Write tests before or alongside every refactored module
- Use `node:` protocol for all Node.js builtins
- Respect `NO_COLOR` environment variable

### Ask First
- Changing any public-facing command names or aliases
- Removing or replacing a dependency (e.g., lodash, prompts, ora)
- Modifying the `tagoconfig.json` schema
- Changing token storage format (`.tago-lock.*.lock` files)
- Adding new CLI flags to existing commands

### Never Do
- Switch away from Commander.js
- Switch away from Node.js
- Break backward compatibility of existing commands
- Store tokens in plaintext
- Add features not in the draft scope
- Skip tests for refactored modules

---

## 7. Execution Phases

### Phase 1: Tooling Migration
1. Remove Biome, `.swcrc`, `@swc-node/register`, `@swc/cli`, `@swc/core`
2. Install and configure oxlint
3. Update `tsconfig.json` for ESM + NodeNext
4. Set `"type": "module"` in `package.json`
5. Bump Node engine to `>=24.0.0`
6. Update dev scripts to use `node --experimental-strip-types`
7. Remove dead config (`jest` block in package.json, `ts-node-dev` dep)

### Phase 2: ESM Migration
1. Convert all imports to ESM (add `.js` extensions, `node:` protocol)
2. Replace `__dirname` with `import.meta.dirname`
3. Replace `require()` calls with `import` or `createRequire`
4. Update Vitest config for ESM
5. Verify all existing tests pass

### Phase 3: Error Handling Refactor
1. Create `lib/errors.ts` with error class hierarchy
2. Create `lib/output.ts` with structured output functions
3. Refactor `messages.ts` → deprecate, redirect to new modules
4. Update all commands to throw `CLIError` subclasses instead of calling `errorHandler`
5. Add centralized error handler in `index.ts`
6. Fix exit codes (currently exits with 0 on error)

### Phase 4: Output Standardization
1. Audit every mutating command for missing output
2. Add `output.change()` calls with IDs, serial numbers, names
3. Ensure consistent prefix usage across all commands
4. Replace all raw `console.log` in commands with `output.*` functions

### Phase 5: Testing
1. Set up test infrastructure (coverage config, test helpers, mock factories)
2. Write P1 tests (lib — pure functions)
3. Write P2 tests (prompts)
4. Write P3 tests (commands)
5. Write P4 tests (export/backup services)
6. Verify 80% coverage threshold

### Phase 6: Dependency Updates
1. Update all dependencies to latest stable
2. Remove unused dependencies (`lodash` if only used in tests, `async` if replaceable)
3. Move misplaced dependencies (`@swc/*` from deps to devDeps, then remove)
4. Run full test suite after updates

---

## 8. Acceptance Criteria

- [ ] All source files use ESM (`import`/`export`, `.js` extensions, `node:` protocol)
- [ ] `package.json` has `"type": "module"` and `"engines": { "node": ">=24.0.0" }`
- [ ] Biome and SWC removed; OXC tooling configured and passing
- [ ] All errors use `CLIError` subclasses with specific exit codes
- [ ] Every mutating command logs what changed (resource type, ID, name, serial number)
- [ ] Output prefixes are distinct: `[OK]`, `[INFO]`, `[WARN]`, `[ERROR]`
- [ ] Vitest coverage >= 80% lines, 75% branches, 80% functions
- [ ] All existing commands work identically from the user's perspective
- [ ] `npm run build` produces a working CLI binary
- [ ] `npm test` passes with no failures
- [ ] No `any` types in production code
- [ ] No `process.exit()` calls outside the centralized error handler
