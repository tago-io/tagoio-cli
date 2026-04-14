# TagoIO CLI Refactoring — Detailed Task Plan

## Dependency Graph

```
Phase 1: Tooling
  T1.1 Remove dead config & deps ──┐
  T1.2 Remove SWC/Biome ──────────┤
  T1.3 Install oxlint ─────────────┤──► CHECKPOINT 1
  T1.4 Update tsconfig for ESM ────┘

Phase 2: ESM Migration (depends on CP1)
  T2.1 package.json type:module ───┐
  T2.2 Add .js extensions ─────────┤
  T2.3 node: protocol imports ─────┤
  T2.4 Replace __dirname ──────────┤──► CHECKPOINT 2
  T2.5 Update vitest config ───────┤
  T2.6 Update dev/build scripts ───┘

Phase 3: Error Handling (depends on CP2)
  T3.1 Create lib/errors.ts ───────┐
  T3.2 Create lib/output.ts ───────┤
  T3.3 Centralized handler ────────┤
  T3.4 Migrate analysis/* ─────────┤
  T3.5 Migrate devices/* ──────────┤
  T3.6 Migrate dashboard/* ────────┤──► CHECKPOINT 3
  T3.7 Migrate profile/* ──────────┤
  T3.8 Migrate prompt/* ───────────┤
  T3.9 Migrate root cmds + lib ────┤
  T3.10 Delete messages.ts ────────┘

Phase 4: Output (depends on CP3)     Phase 5: Testing (depends on CP3)
  T4.1 Mutation output audit ──┐      T5.1 Test infrastructure ──┐
  T4.2 Replace raw console ───┤      T5.2 lib/ tests ────────────┤
  T4.3 Prefix consistency ────┘      T5.3 prompt/ tests ─────────┤
         │                            T5.4 command tests ──────────┤
         ▼                            T5.5 export/backup tests ────┘
    CHECKPOINT 4                           │
         │                            CHECKPOINT 5
         └──────────┬──────────────────────┘
                    ▼
Phase 6: Dependency Updates
  T6.1 Update all deps ───────┐
  T6.2 Remove unused deps ────┤──► CHECKPOINT 6 (DONE)
  T6.3 Final verification ────┘
```

---

## Phase 1: Tooling Migration

### T1.1 — Remove Dead Config and Unused Dependencies

**Description**: Clean out dead config and unused deps: `jest` block in package.json (lines 37-41), `ts-node-dev` from devDependencies, `@swc/cli` from production dependencies.

**Files**:
- `package.json`

**Acceptance Criteria**:
- `npm install` succeeds
- `npm test` passes (existing 4 tests)
- `npm run build` produces working CLI
- No `jest` config in package.json
- `ts-node-dev` removed from devDependencies

**Verification**:
```bash
npm install && npx vitest run && npm run build && node ./build/index.js --version
```

---

### T1.2 — Remove SWC and Biome

**Description**: Remove SWC stack (`@swc-node/register`, `@swc/cli`, `@swc/core`, `unplugin-swc`) and Biome (`@biomejs/biome`). Delete `.swcrc` and `biome.json`. Remove `linter`/`linter-fix` scripts. Vitest config simplified (SWC plugin removed).

**Files**:
- `package.json` (remove 5 deps, remove scripts)
- `.swcrc` (delete)
- `biome.json` (delete)
- `vitest.config.js` (remove SWC plugin)

**Acceptance Criteria**:
- `.swcrc` and `biome.json` deleted
- No SWC/Biome packages in package.json
- `npm run build` still works

**Verification**:
```bash
npm install && npm run build && node ./build/index.js --version
test ! -f .swcrc && test ! -f biome.json
```

---

### T1.3 — Install and Configure oxlint

**Description**: Install `oxlint` as devDependency. Create `oxlint.json` mirroring useful rules from old biome.json. Add `lint` and `lint:fix` scripts.

**Files**:
- `package.json` (add dep + scripts)
- `oxlint.json` (new)

**Acceptance Criteria**:
- `npm run lint` runs oxlint
- Config includes: noExplicitAny (warn), useNodejsImportProtocol (warn), noUnusedVariables (error)

**Verification**:
```bash
npx oxlint  # runs without crashing
```

---

### T1.4 — Update tsconfig.json for ESM + NodeNext

**Description**: Change tsconfig to `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`. TypeScript will error on imports without `.js` extensions — expected, fixed in Phase 2.

**Files**:
- `tsconfig.json`

**Acceptance Criteria**:
- tsconfig has NodeNext module/moduleResolution
- `tsc --noEmit` errors are only extension-related (TS2835/TS2834)

**Verification**:
```bash
npx tsc --noEmit 2>&1 | head -50  # only import extension errors
```

---

### ✅ CHECKPOINT 1: Tooling Migration Complete

- [ ] `.swcrc`, `biome.json` deleted
- [ ] SWC/Biome packages removed
- [ ] oxlint installed and runnable
- [ ] tsconfig updated to NodeNext
- [ ] `npm run build` works

---

## Phase 2: ESM Migration

### T2.1 — Set package.json to type:module + Bump Engine

**Files**: `package.json`

**Changes**:
- Add `"type": "module"`
- Bump engines to `"node": ">=24.0.0"`

---

### T2.2 — Add .js Extensions to All Local Imports

**Description**: The largest mechanical task. ~200+ relative imports across 88 files need `.js` appended. Directory imports need `/index.js`. Consider using a codemod script.

**Files**: All 88 source files with relative imports

**Acceptance Criteria**:
- Every relative import ends in `.js`
- `npx tsc --noEmit` produces zero errors

**Verification**:
```bash
npx tsc --noEmit  # zero errors
# No extensionless relative imports:
grep -rn "from [\"']\..*[^s]\"" src/ | grep -v "\.js\"" | grep -v "\.json\"" | grep -v node_modules
```

---

### T2.3 — Replace Bare Node Builtin Imports with node: Protocol

**Files** (6 remaining):
- `src/index.ts` — `"fs"` → `"node:fs"`
- `src/commands/devices/device-bkp.ts` — `"fs"`
- `src/lib/token.ts` — `"crypto"`, `"fs"`
- `src/lib/dotenv-config.ts` — `"fs"`, `"path"`
- `src/lib/add-to-gitignore.ts` — `"fs"`
- `src/commands/profile/export/services/export-backup/export-backup.ts` — `"fs"`
- `src/prompt/pick-files-from-tagoio.ts` — `"path"`

**Verification**:
```bash
grep -rn "from [\"']\(fs\|path\|crypto\|os\|url\|stream\|child_process\|events\)[\"']" src/  # empty
```

---

### T2.4 — Replace __dirname and readFileSync for package.json

**Files**:
- `src/lib/config-file.ts` — `__dirname` → `import.meta.dirname`
- `src/index.ts` — update package.json reading

**Verification**:
```bash
grep -rn "__dirname\|__filename" src/  # empty
```

---

### T2.5 — Update Vitest Config for ESM

**Files**: `vitest.config.js` → `vitest.config.ts`

**Acceptance Criteria**:
- No SWC plugin
- `npx vitest run` passes all 4 existing tests

---

### T2.6 — Update Dev/Build Scripts for Node 24

**Changes in package.json**:
- `start`: `node --experimental-strip-types ./src/index.ts`
- Remove `xpto` debug script
- Keep `build`: `tsc --build` + `chmod +x`

**Verification**:
```bash
npm start -- --version
npm run build && node ./build/index.js --version
npm test
```

---

### ✅ CHECKPOINT 2: ESM Migration Complete

- [ ] `"type": "module"` in package.json
- [ ] All imports have `.js` extensions
- [ ] All node builtins use `node:` protocol
- [ ] No `__dirname` / `__filename` / `require()`
- [ ] `npx tsc --noEmit` zero errors
- [ ] `npm start -- --version` works (Node 24 native TS)
- [ ] `npm run build && node ./build/index.js --version` works
- [ ] All 4 existing tests pass

---

## Phase 3: Error Handling Refactor

### T3.1 — Create lib/errors.ts + Tests

**New files**:
- `src/lib/errors.ts` — `CLIError` (code 1), `ConfigError` (code 3), `APIError` (code 4), `AuthError` (code 5)
- `src/lib/errors.test.ts` — 8 tests

---

### T3.2 — Create lib/output.ts + Tests

**New files**:
- `src/lib/output.ts` — `output.success()` [OK], `output.info()` [INFO], `output.warn()` [WARN], `output.change()` [ACTION]
- `src/lib/output.test.ts` — 6 tests

---

### T3.3 — Centralized Error Handler in index.ts

**File**: `src/index.ts`

**Changes**:
- Add `handleError(error: unknown): never` function
- Replace `.catch(console.error)` with `.catch(handleError)`
- `CLIError` → use its exit code + hint
- Unknown errors → exit code 1

---

### T3.4 — Migrate commands/analysis/* (6 files)

Replace `errorHandler()` → `throw new CLIError()`, `successMSG`/`infoMSG` → `output.*`, remove `process.exit()`.

**Files**: `deploy.ts`, `run-analysis.ts`, `trigger-analysis.ts`, `analysis-console.ts`, `analysis-set-mode.ts`, `duplicate-analysis.ts`

---

### T3.5 — Migrate commands/devices/* (9 files)

Same migration. Fix the `.catch(errorHandler)` anti-pattern in `change-network.ts:56`.

**Files**: `change-network.ts`, `change-bucket-type.ts`, `copy-data.ts`, `data-get.ts`, `data-post.ts`, `device-bkp.ts`, `device-info.ts`, `device-list.ts`, `device-live-inspector.ts`

---

### T3.6 — Migrate commands/dashboard/* (1 file)

**File**: `copy-tab.ts`

---

### T3.7 — Migrate commands/profile/* (~28 files)

Largest batch. Export services (7 files), backup commands (4 files), backup resources (12 files), supporting files.

---

### T3.8 — Migrate prompt/* (~7 files)

Files with `process.exit()`: `pick-environment.ts`, `pick-analysis-from-tagoio.ts`, `pick-device-id-from-tagoio.ts`, `pick-dashboard-id-from-tagoio.ts`, `pick-analysis-from-config.ts`, `choose-analysis-from-tagoio.ts`, `pick-files-from-tagoio.ts`

---

### T3.9 — Migrate Root Commands + lib/

**Files**: `login.ts`, `start-config.ts`, `set-env.ts`, `list-env.ts`, `config-file.ts`, `display-warning.ts`, `index.ts`

**Critical**: `config-file.ts` has 4 `errorHandler()` calls → `throw new ConfigError()`. This changes control flow from "exit immediately" to "throw upward" — callers' `if (!config) return` guards become dead code. Review each caller.

---

### T3.10 — Delete messages.ts

**Prerequisite**: All 56 consumers migrated (T3.4–T3.9).

**Verification**:
```bash
test ! -f src/lib/messages.ts
npx tsc --noEmit && npx vitest run && npm run build
```

---

### ✅ CHECKPOINT 3: Error Handling Complete

- [ ] `messages.ts` deleted
- [ ] `lib/errors.ts` + `lib/output.ts` exist with tests
- [ ] Zero `process.exit()` outside index.ts handler
- [ ] All errors use CLIError hierarchy
- [ ] All tests pass
- [ ] Smoke test: `tagoio set-env nonexistent` shows error with hint, exits code 3

---

## Phase 4: Output Standardization

### T4.1 — Audit and Standardize Mutation Output

Add `output.change()` to every mutating command with action, resource type, and identifying details.

**Key**: `change-network.ts` must output device serial numbers (explicitly required in draft spec).

**Format**: `[UPDATE] device id=64a1b2c3 serial=SN-001 network=net-id connector=conn-id`

---

### T4.2 — Replace Raw console.log in Commands

57 instances across 30 command files → replace with `output.*` calls.

---

### T4.3 — Verify Prefix Consistency

Ensure `[OK]`, `[INFO]`, `[WARN]`, `[ERROR]` are used correctly. No duplicate semantics.

---

### ✅ CHECKPOINT 4: Output Standardization Complete

- [ ] All mutating commands produce `output.change()` with IDs
- [ ] No raw `console.log` in command handlers
- [ ] Distinct prefixes throughout

---

## Phase 5: Testing (parallel with Phase 4)

### T5.1 — Test Infrastructure Setup

**New files**:
- `src/test-utils/mock-sdk.ts` — Account mock factory
- `src/test-utils/mock-config.ts` — getEnvironmentConfig mock factory
- `src/test-utils/capture-output.ts` — output spy helper
- Update `vitest.config.ts` with v8 coverage (50% thresholds)

---

### T5.2 — P1: lib/ Unit Tests (~50 tests)

Test all pure-function lib modules: `config-file.ts`, `token.ts`, `search-name.ts`, `add-https-to-url.ts`, `add-to-gitignore.ts`, `commander-repeatable.ts`, `dotenv-config.ts`, `get-current-folder.ts`, `replace-obj.ts`, `compare.ts`, `configure-help.ts`, `current-runtime.ts`

---

### T5.3 — P2: prompt/ Unit Tests (~35 tests)

Test all 15 prompt files using `prompts.inject()`. Happy path + cancellation per prompt.

---

### T5.4 — P3: Command Tests (~80 tests)

Test all command handlers with mocked SDK/config/prompts. Split by domain:
- T5.4a: analysis (6 files, ~20 tests)
- T5.4b: devices (8 files, ~30 tests)
- T5.4c: dashboard + root (5 files, ~15 tests)
- T5.4d: profile commands (4 files, ~15 tests)

---

### T5.5 — P4: Export/Backup Service Tests (~50 tests)

Expand existing tests + new tests for export services and backup resource files.

---

### ✅ CHECKPOINT 5: Testing Complete

- [ ] `npx vitest run --coverage` >= 50% line coverage
- [ ] All ~230 tests pass
- [ ] No test uses real API calls

---

## Phase 6: Dependency Updates

### T6.1 — Update All Dependencies

Run `npm outdated` and update. Watch: `commander` (breaking changes), `ora` (v5 CJS → v6 ESM), `@tago-io/sdk`.

---

### T6.2 — Remove Unused Dependencies

- `lodash` → replace `cloneDeep` with `structuredClone()` (Node 17+)
- Evaluate `async` package usage in backup resources

---

### T6.3 — Final Verification

Run full SPEC acceptance criteria:

```bash
npm run lint                                          # oxlint passes
npx vitest run --coverage                             # >= 50%, all pass
npm run build && node ./build/index.js --version      # build works
node --experimental-strip-types src/index.ts --version # dev works
grep -rn "process.exit" src/ | wc -l                  # 1 (index.ts only)
grep -rn "require(" src/                              # 0
grep -rn "__dirname" src/                             # 0
```

---

### ✅ CHECKPOINT 6: Refactoring Complete
