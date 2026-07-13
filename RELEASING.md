# Releasing Packages

This repository uses Turborepo for build/test tasks and Changesets for versioning and npm publishing.

## Publishable Packages

- `@core-ai/core-ai`
- `@core-ai/opentelemetry`
- `@core-ai/langfuse`
- `@core-ai/openai`
- `@core-ai/anthropic`
- `@core-ai/google-genai`
- `@core-ai/mistral`
- `@core-ai/azure-openai`
- `@core-ai/omnifact`
- `@core-ai/vertex-anthropic`

These packages are configured as a fixed group in `.changeset/config.json`, so they always share the same version.

## Developer Workflow (PRs)

1. Make your code changes.
2. Add a changeset:

```bash
npm run changeset
```

3. Select the package(s) and bump type (`patch`, `minor`, `major`).
4. Commit both code and the generated `.changeset/*.md` file.

## Release Workflow (maintainer)

1. Validate the repo:

```bash
npm run release:check
```

2. Apply version and changelog updates:

```bash
npm run release:version
```

3. Commit the generated version/changelog changes.
4. Publish:

```bash
npm run release:publish
```

## First-time Publishing Notes

- Ensure you are authenticated to npm:

```bash
npm login
```

- If this is the first release for the scoped packages, keep `publishConfig.access` as `public` (already configured).

### Initial publish for a new package

New packages must exist on npm before trusted publishing can be configured. Publish the first version manually:

```bash
npm run build
npm publish -w @core-ai/azure-openai --access public
npm publish -w @core-ai/omnifact --access public
npm publish -w @core-ai/vertex-anthropic --access public
```

### Trusted publishing (CI releases)

The `.github/workflows/release.yml` workflow publishes via npm OIDC trusted publishing. For each new package, configure a trusted publisher on [npmjs.com](https://www.npmjs.com):

1. Open the package **Settings → Trusted publishing**
2. Select **GitHub Actions**
3. Set **Organization or user** to `agdevhq`
4. Set **Repository** to `core-ai`
5. Set **Workflow filename** to `release.yml` (exact match, including extension)
6. Leave **Environment name** blank unless the workflow uses a deployment environment

After the trusted publisher is saved, future releases from `main` publish automatically with provenance attestations. Each package needs its own trusted publisher configuration.
