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

### Pre-1.0 versioning

While packages are below `1.0.0`, use `minor` for breaking changes instead of `major`. Changesets does not auto-downgrade major bumps for pre-1.0 packages -- a `major` on `0.x.y` will jump straight to `1.0.0`. Use `major` only when intentionally releasing `1.0.0`.

### Fixed version group

All publishable packages share a single version number:

- `@core-ai/core-ai`
- `@core-ai/openai`
- `@core-ai/anthropic`
- `@core-ai/google-genai`
- `@core-ai/mistral`

Selecting any one package in a changeset bumps all five to the same version. However, **list every package that has meaningful changes** so each gets its own changelog entry.

### Changeset scope and granularity

- One changeset per **logical change**. If core types and provider adapters change for different reasons, use separate changesets.
- When each provider implements distinct behavior (e.g., different cache mapping logic), give each provider its own changeset so changelogs reflect provider-specific details.
- A single changeset covering all packages is fine when the change is uniform (e.g., a shared config tweak).

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
