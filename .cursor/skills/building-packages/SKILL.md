---
name: building-packages
description: Explains how packages are built in this monorepo. Use when working on build configuration, tsup config, package exports, or troubleshooting build issues.
---

# Building Packages

## Overview

Publishable packages are built with **tsup** (esbuild-based), orchestrated by **Turborepo**.

## Publishable Packages

- `@core-ai/core-ai` — core types, utilities, error classes
- `@core-ai/openai` — OpenAI provider
- `@core-ai/anthropic` — Anthropic provider
- `@core-ai/google-genai` — Google GenAI provider

Internal packages (`eslint-config`, `typescript-config`, `esbuild-config`) are not built or published.

## Build Commands

```bash
# Build all packages (runs tsup per package in dependency order)
npm run build

# Build a single package
npm run build -w @core-ai/openai
```

## How It Works

### Turborepo orchestration

`turbo.json` defines the `build` task with `dependsOn: ["^build"]`, so `core-ai` builds first, then providers build in parallel. Build outputs (`dist/**`) are cached.

### tsup configuration

Each publishable package has a `tsup.config.ts`:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    outDir: 'dist',
});
```

This produces:
- `dist/index.js` — ESM JavaScript bundle (dependencies externalized)
- `dist/index.d.ts` — TypeScript declarations

### Package exports

Each `package.json` points to built output:

```json
{
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.js"
        }
    },
    "files": ["dist", "README.md", "LICENSE"]
}
```

### TypeScript and `.ts` imports

Source code uses `.ts` import extensions with `allowImportingTsExtensions: true` and `noEmit: true` in the shared tsconfig. tsup/esbuild handles these extensions during bundling, and `dts: true` uses `emitDeclarationOnly` mode for declaration generation.

## Dependency Graph

Providers depend on `core-ai` (acyclic — no reverse dependency):

```
@core-ai/openai      ──┐
@core-ai/anthropic    ──┼──▶ @core-ai/core-ai
@core-ai/google-genai ──┘
```

## Troubleshooting

### `check-types` fails after build with "Could not find declaration file"

Turbo must run `build` before `check-types` for provider packages. Use `npm run release:check` which sequences build before lint/check-types.

### Adding a new publishable package

1. Create `packages/<name>/tsup.config.ts` (copy from any existing package).
2. Add `"build": "tsup"` to the package's scripts.
3. Set `exports`, `main`, `types`, and `files` pointing to `dist/`.
4. Add the package to the `fixed` group in `.changeset/config.json`.
