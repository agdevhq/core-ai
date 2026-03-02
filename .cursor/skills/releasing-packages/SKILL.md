---
name: releasing-packages
description: How to version and publish packages to npm from the main branch. Use when running release commands, publishing to npm, or troubleshooting publish issues. For changeset authoring and PR prep, use the contributing skill instead.
---

# Releasing Packages

Releases happen from `main`, not from feature branches. Multiple changesets accumulate between releases.

## Release Workflow

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

`release:version` consumes all pending changesets and calculates the combined bump (e.g., two patches + one minor = minor).

Commit these changes.

### 3. Publish

```bash
npm run release:publish
```

Publishes only packages whose versions changed, in correct dependency order (`core-ai` first, then providers).

Requires npm authentication (`npm login`). If 2FA is enabled, npm prompts for an OTP per package.

### 4. Push

```bash
git push && git push --tags
```

## Release Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run release:check` | Build + lint + type-check | Validate repo before release |
| `npm run release:version` | `changeset version` | Bump versions, update changelogs |
| `npm run release:publish` | `changeset publish` | Publish changed packages to npm |

## Key Configuration

### `.changeset/config.json`

- `"fixed"` — groups all five packages to the same version
- `"access": "public"` — scoped packages publish as public
- `"updateInternalDependencies": "patch"` — auto-bumps internal dep ranges on any release

### Package-level `package.json`

Each publishable package has:
- `"publishConfig": { "access": "public" }`
- `"files": ["dist", "README.md", "LICENSE"]` — only ships compiled output

**Note:** No `prepublishOnly` — the release workflow runs `npm run build` before the changesets action. Per-package `prepublishOnly` causes a race when `changeset publish` runs builds concurrently: provider packages can fail with "Cannot find module '@core-ai/core-ai'" if core-ai's tsup (with `clean: true`) clears its dist while they resolve types.

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
