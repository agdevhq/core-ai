---
name: contributing
description: Branch naming, changeset authoring, and PR conventions for this monorepo. Use when creating branches, committing, writing changesets, opening PRs, or running pre-merge checks.
---

# Contributing

## Branch Naming

```
main (protected, always releasable)
 ├── feat/add-streaming-cache
 ├── fix/anthropic-tool-parsing
 └── chore/update-deps
```

| Prefix      | Use                                        |
| ----------- | ------------------------------------------ |
| `feat/`     | New feature or capability                  |
| `fix/`      | Bug fix                                    |
| `chore/`    | Tooling, deps, CI, docs                    |
| `refactor/` | Code restructuring without behavior change |

No long-lived `develop` or `release/*` branches. Feature/fix branches are short-lived, branched from `main`, merged via PR.

## Changesets

Every PR **must** include a changeset. Changesets drive version bumps and changelog generation.

### Creating a changeset

Prefer the interactive CLI:

```bash
npm run changeset
```

This prompts for affected packages, bump type, and a summary, then writes a `.changeset/<random-name>.md` file.

### Changeset file format

If writing a changeset by hand, use this exact format:

```md
---
'@core-ai/core-ai': minor
---

Short description of the change for the changelog.
```

Rules:

- YAML frontmatter between `---` delimiters (required)
- Package names are **quoted** with single quotes and include the scope
- Bump type is one of: `patch`, `minor`, `major`
- Body below the frontmatter is the changelog entry
- **Default to one package per file.** Listing multiple packages in one file's frontmatter copies the **same body text** to every listed package's changelog — it does not produce package-specific entries.

### Pre-1.0 versioning

While packages are below `1.0.0`, use `minor` for breaking changes instead of `major`. Changesets does not auto-downgrade major bumps for pre-1.0 packages -- a `major` on `0.x.y` will jump straight to `1.0.0`. Use `major` only when intentionally releasing `1.0.0`.

### Fixed version group

All publishable packages share a single version number:

- `@core-ai/core-ai`
- `@core-ai/openai`
- `@core-ai/anthropic`
- `@core-ai/google-genai`
- `@core-ai/google-genai-vertex`
- `@core-ai/mistral`
- `@core-ai/omnifact`
- `@core-ai/anthropic-vertex`

Selecting any one package in a changeset bumps every package in the fixed group to the same version. Create a changeset for **every package with meaningful changes** — use separate files when the changelog text differs per package.

### Changeset scope and granularity

Use this decision table:

| Situation                                                                                             | Files                    | Frontmatter          | Body                                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------ | -------------------- | ------------------------------------------------------------------- |
| Independent provider changes (new package, provider-specific API, new models, internal updates)       | **One file per package** | One package each     | Scoped to that package only — never mention other provider packages |
| Uniform cross-package change (shared interface, method signature, config tweak in `@core-ai/core-ai`) | One file                 | Multiple packages OK | Same text applies to all listed packages                            |
| Multi-package PR with different changes per provider                                                  | **Multiple files**       | One package per file | Each file has its own scoped body                                   |

Additional rules:

- One changeset per **logical change**. If core types and provider adapters change for different reasons, use separate changesets.
- **Provider changes**: Use one changeset file per provider when changes are **independent**. A coordinated refactor across providers (e.g. new `openai.chat` API, new `@core-ai/openai-compat` package, Azure v1 Responses default, Omnifact wiring) still counts as independent — split the changesets.
- **Cross-provider changes**: Use a single changeset with multiple packages in the frontmatter only when the **identical** changelog text is correct for every listed package.
- Do **not** combine independent provider changes into one file — the body is duplicated verbatim into every listed package's changelog.

### Empty changesets

For changes that don't affect published packages (CI, internal tooling, docs, tests):

```bash
npx changeset --empty
```

The release automation requires a changeset on every PR to function correctly.

## PR Conventions

### Pre-merge checklist

Before opening or updating a PR, verify:

1. Code changes are complete and tested
2. `npm run release:check` passes (build + lint + types)
3. Changeset file is included
4. PR description explains **what** and **why**

### Typical flow

```bash
git checkout -b feat/my-feature main

# Make changes, commit as you go
git add . && git commit -m "implement feature X"

# Add changeset before opening PR
npm run changeset
git add .changeset/ && git commit -m "add changeset"

# Push and open PR
git push -u origin feat/my-feature
```

After review, merge to `main` (squash or merge commit).

## Quick Reference

| Task                  | Command / Action                 |
| --------------------- | -------------------------------- |
| Start feature         | `git checkout -b feat/name main` |
| Add changeset         | `npm run changeset`              |
| Empty changeset       | `npx changeset --empty`          |
| Validate before merge | `npm run release:check`          |
