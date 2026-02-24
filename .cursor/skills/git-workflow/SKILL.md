---
name: git-workflow
description: Git branching strategy, PR conventions, and release flow for this monorepo. Use when creating branches, opening PRs, merging, releasing, or when the user asks about the git workflow or contributing process.
---

# Git Workflow

## Branch Strategy

```
main (protected, always releasable)
 ├── feat/add-streaming-cache
 ├── fix/anthropic-tool-parsing
 └── chore/update-deps
```

- **`main`** is the source of truth. Always passes `release:check`.
- **Feature/fix branches** are short-lived, branched from `main`, merged via PR.
- No long-lived `develop` or `release/*` branches. Changesets handles release coordination.

### Branch Naming

| Prefix | Use |
|--------|-----|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, CI, docs |
| `refactor/` | Code restructuring without behavior change |

## PR Conventions

Every PR includes:

1. **Code changes** (the feature, fix, or refactor)
2. **A changeset file** (if published packages are affected)

### Adding a changeset to a PR

```bash
npm run changeset
```

Select affected packages and bump type (`patch`, `minor`, `major`). Commit the generated `.changeset/*.md` file with the code.

Because all four publishable packages are in a fixed version group, selecting any one bumps all to the same version.

### When to use an empty changeset

Every PR **must** include a changeset — no exceptions. For changes that don't affect published packages (CI config, internal tooling, docs, tests), use an empty changeset:

```bash
npx changeset --empty
```

The release automation requires a changeset on every PR to function correctly.

### PR checklist

- Code changes are complete and tested
- `npm run release:check` passes (build + lint + types)
- Changeset file is included (if applicable)
- PR description explains **what** and **why**

## Typical Developer Flow

```bash
# Start work
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

## Release Flow

Releases happen from `main`, not from feature branches. Multiple changesets accumulate between releases.

```bash
# 1. Validate
npm run release:check

# 2. Consume changesets, bump versions, update changelogs
npm run release:version

# 3. Commit version + changelog changes
git add . && git commit -m "release: bump versions"

# 4. Publish to npm
npm run release:publish

# 5. Push
git push && git push --tags
```

`release:version` consumes all pending changesets and calculates the combined bump (e.g., two patches + one minor = minor).

## Quick Reference

| Task | Command / Action |
|------|-----------------|
| Start feature | `git checkout -b feat/name main` |
| Add changeset | `npm run changeset` |
| Validate before merge | `npm run release:check` |
| Bump versions | `npm run release:version` |
| Publish to npm | `npm run release:publish` |
