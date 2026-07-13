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
- `@core-ai/anthropic-vertex`

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

New packages must exist on npm before trusted publishing can be configured. Publish the first version manually (local machines cannot mint provenance, so disable it for the bootstrap publish only — keep `"provenance": true` in `publishConfig` for CI):

```bash
npm run build
npm publish -w @core-ai/<package-name> --access public --provenance=false --otp=<OTP>
```

### Trusted publishing (CI releases)

The `.github/workflows/release.yml` workflow publishes via npm OIDC trusted publishing. Requires **npm ≥ 11.15.0** locally (`npm install -g npm@^11.15.0`). Older CLIs fail with a vague `400 Bad Request` on `npm trust`.

For each new package, create the trusted publisher with the CLI (`--allow-publish` is required — without it the trust config cannot publish):

```bash
npm trust github @core-ai/<package-name> \
  --file release.yml \
  --repo agdevhq/core-ai \
  --allow-publish \
  -y \
  --otp=<OTP>

npm trust list @core-ai/<package-name> --otp=<OTP>
```

Verify: `type: github`, `file: release.yml`, `repository: agdevhq/core-ai`, `permissions: publish`.

After that, future releases from `main` publish automatically with provenance attestations. Each package needs its own trusted publisher configuration.
