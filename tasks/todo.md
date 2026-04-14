# TagoIO CLI Refactoring — Task List

## Phase 1: Tooling Migration

- [ ] **T1.1** Remove dead config & unused deps (jest block, ts-node-dev, @swc/cli misplacement)
- [ ] **T1.2** Remove SWC and Biome (delete .swcrc, biome.json, remove 5 packages)
- [ ] **T1.3** Install and configure oxlint (config + lint scripts)
- [ ] **T1.4** Update tsconfig.json (module: NodeNext, moduleResolution: NodeNext)
- [ ] **CP1** — Tooling migration verified

## Phase 2: ESM Migration

- [ ] **T2.1** Set package.json type:module + engine >=24.0.0
- [ ] **T2.2** Add .js extensions to all local imports (~200+ imports, 88 files)
- [ ] **T2.3** Replace bare node builtin imports with node: protocol (6 files)
- [ ] **T2.4** Replace __dirname with import.meta.dirname (config-file.ts, index.ts)
- [ ] **T2.5** Update vitest config for ESM (remove SWC plugin)
- [ ] **T2.6** Update dev/build scripts for Node 24 (native TS execution)
- [ ] **CP2** — ESM migration verified

## Phase 3: Error Handling Refactor

- [ ] **T3.1** Create lib/errors.ts + tests (CLIError, ConfigError, APIError, AuthError)
- [ ] **T3.2** Create lib/output.ts + tests (success, info, warn, change)
- [ ] **T3.3** Centralized error handler in index.ts
- [ ] **T3.4** Migrate commands/analysis/* (6 files)
- [ ] **T3.5** Migrate commands/devices/* (9 files)
- [ ] **T3.6** Migrate commands/dashboard/* (1 file)
- [ ] **T3.7** Migrate commands/profile/* (~28 files)
- [ ] **T3.8** Migrate prompt/* (~7 files)
- [ ] **T3.9** Migrate root commands + lib/ (7 files)
- [ ] **T3.10** Delete messages.ts
- [ ] **CP3** — Error handling verified

## Phase 4: Output Standardization

- [ ] **T4.1** Audit & add output.change() to all mutating commands
- [ ] **T4.2** Replace raw console.log in commands (57 instances, 30 files)
- [ ] **T4.3** Verify prefix consistency ([OK], [INFO], [WARN], [ERROR])
- [ ] **CP4** — Output standardization verified

## Phase 5: Testing (parallel with Phase 4)

- [ ] **T5.1** Test infrastructure (mock factories, capture helpers, coverage config)
- [ ] **T5.2** P1: lib/ unit tests (~50 tests)
- [ ] **T5.3** P2: prompt/ unit tests (~35 tests)
- [ ] **T5.4** P3: command tests (~80 tests)
- [ ] **T5.5** P4: export/backup service tests (~50 tests)
- [ ] **CP5** — Testing verified (>= 50% coverage)

## Phase 6: Dependency Updates

- [ ] **T6.1** Update all dependencies to latest stable
- [ ] **T6.2** Remove unused deps (lodash → structuredClone, evaluate async)
- [ ] **T6.3** Final end-to-end verification
- [ ] **CP6** — Refactoring complete
