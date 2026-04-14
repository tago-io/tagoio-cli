# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development — runs src/index.ts directly via SWC register
npm start

# Build — compiles TypeScript to ./build/ (CommonJS output)
npm run build

# Test — runs Vitest in watch mode
npm test

# Single test run (no watch)
npm run test:single

# Run a specific test file
npx vitest run src/commands/analysis/run-analysis.test.ts

# Lint
npm run linter

# Lint with auto-fix
npm run linter-fix
```

## Architecture

This is a CLI tool for the TagoIO IoT platform, published as `@tago-io/cli` on npm. Users install it globally and invoke it as `tagoio`.

### Stack

- **Commander.js** for command parsing and help generation
- **@tago-io/sdk** for all TagoIO API interactions
- **prompts** for interactive user input
- **kleur** for terminal colors
- **SWC** for dev-time transpilation, **TSC** for production build
- **Biome** for linting
- **Vitest** for testing (uses SWC plugin for test transpilation)

### Command Registration Pattern

All commands are registered in `src/index.ts` by calling domain-specific functions that receive the Commander `program` instance:

```
src/index.ts → analysisCommands(program)  → src/commands/analysis/index.ts
             → deviceCommands(program)    → src/commands/devices/index.ts
             → dashboardCommands(program) → src/commands/dashboard/index.ts
             → profileCommands(program)   → src/commands/profile/index.ts
```

Each `index.ts` defines commands with `.command()`, `.alias()`, `.option()`, and `.action(handler)`. The handler is imported from a sibling file (e.g., `deploy.ts`, `change-network.ts`).

Visual section headers are created via `program.command("Analysis Header")` — these are Commander commands that render as category labels in help output.

### Environment & Authentication System

The CLI uses a project-local `tagoconfig.json` file to store environment configurations. Each environment maps to a profile (name, email, profile ID, analysis list). Tokens are stored in `.tago-lock.<env>.lock` files alongside the config, obfuscated with 500 lines of random hex (the actual token is hex-encoded on the last line).

Key flow: `getEnvironmentConfig(env)` in `src/lib/config-file.ts` resolves the active environment, reads the token via `readToken()` from `src/lib/token.ts`, and returns an object with `profileToken` and `profileRegion` used to instantiate `new Account({...})` from the SDK.

The default environment is stored in a `.env` file as `TAGOIO_DEFAULT`.

### Error Handling (current)

`src/lib/messages.ts` exports `errorHandler(str)` which prints `[ERROR]` and calls `process.exit(0)`. Note: it exits with code 0 (success) — this is a known bug. Commands use `errorHandler` both for direct error reporting and as a `.catch()` callback (e.g., `account.devices.info(id).catch(errorHandler)`).

### Testing Pattern

Tests are co-located with source files (`.test.ts` alongside `.ts`). Currently only 4 test files exist. The pattern is to export internal functions with `_` prefix for testability (e.g., `_buildCMD`, `_createDataFilter`) and test those pure functions. The `prompts` library supports `prompts.inject([...])` for simulating user input in tests.

### CI Pipeline

CI runs on every push: `npm ci` → `npm run linter` → `npm test` → `npm run build`. Publishing to npm happens on GitHub release creation with `--provenance`.

### Custom Region Support

The CLI supports custom TagoIO deployments (TagoDeploy) via `tagoAPIURL` and `tagoSSEURL` fields in environment config, resolved in `getProfileRegion()`. The default region is `"us-e1"`.
