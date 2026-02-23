---
name: releasing-packages
description: Explains how to version and publish packages to npm using Changesets. Use when releasing, publishing, versioning packages, creating changesets, or troubleshooting npm publish issues.
---

# Releasing Packages

## Overview

Versioning and publishing uses **Changesets**. All publishable packages are in a **fixed version group** — they always share the same version number.

## Publishable Packages (fixed group)

- `@core-ai/core-ai`
- `@core-ai/openai`
- `@core-ai/anthropic`
- `@core-ai/google-genai`
- `@core-ai/mistral`

Configured in `.changeset/config.json` under `"fixed"`.

## Release Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run changeset` | `changeset` | Create a changeset file for pending changes |
| `npm run release:check` | Build + lint + type-check | Validate repo before release |
| `npm run release:version` | `changeset version` | Bump versions, update changelogs |
| `npm run release:publish` | `changeset publish` | Publish changed packages to npm |

## Developer Workflow (during PRs)

After making code changes, add a changeset:

```bash
npm run changeset
```

This prompts for:
1. Which packages changed
2. Bump type: `patch` (bug fix), `minor` (new feature), `major` (breaking)
3. A summary of the change

It creates a `.changeset/<random-name>.md` file. Commit this file with the code changes.

Because of the fixed version group, selecting any one package bumps all five to the same version.

## Maintainer Release Workflow

### 1. Validate

```bash
npm run release:check
```

Runs build, lint, and type-check across all packages.

### 2. Version

```bash
npm run release:version
```

Changesets reads pending `.changeset/*.md` files and:
- Bumps `version` in all five package.json files
- Updates internal dependency ranges (e.g., providers' `@core-ai/core-ai` range)
- Generates/updates `CHANGELOG.md` per package
- Deletes consumed `.changeset/*.md` files

Commit these changes.

### 3. Publish

```bash
npm run release:publish
```

Publishes only packages whose versions changed, in correct dependency order (`core-ai` first, then providers).

Requires npm authentication (`npm login`). If 2FA is enabled, npm prompts for an OTP per package.

## Key Configuration

### `.changeset/config.json`

- `"fixed"` — groups all five packages to the same version
- `"access": "public"` — scoped packages publish as public
- `"updateInternalDependencies": "patch"` — auto-bumps internal dep ranges on any release

### Package-level `package.json`

Each publishable package has:
- `"publishConfig": { "access": "public" }`
- `"prepublishOnly": "npm run build"` — builds before every publish
- `"files": ["dist", "README.md", "LICENSE"]` — only ships compiled output

## Adding a New Package to the Release Group

1. Remove `"private": true` from the package's `package.json`.
2. Add `publishConfig`, `files`, `main`, `types`, `exports` (see existing packages).
3. Add the package name to the `"fixed"` array in `.changeset/config.json`.

## Manual Publish (without Changesets)

For one-off publishes or the initial release:

```bash
npm publish -w @core-ai/core-ai --access public
npm publish -w @core-ai/openai --access public
npm publish -w @core-ai/anthropic --access public
npm publish -w @core-ai/google-genai --access public
npm publish -w @core-ai/mistral --access public
```

Publish `core-ai` first since providers depend on it.
