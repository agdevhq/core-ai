# Repository Conventions

## What this is

`core-ai` — a type-safe TypeScript abstraction layer over LLM provider SDKs (chat, streaming, structured output, tool calling, embeddings, image generation). Turborepo monorepo with npm workspaces, Node >= 22, all ESM.

This is a reliability- and production-focused library: hold every change to high standards regarding architecture and code quality.

Task-specific instructions live in `.agents/skills/`. Read `contributing` before branching, committing, or opening PRs — branch naming and changeset rules live there. Other skills: `building-packages` (tsup/exports/build issues), `releasing-packages` (npm publishing), `mintlify` (docs site), `deslop` (run when finalizing a PR), `writing-plans`.

## Workspace

Turborepo monorepo managed with npm workspaces.

- Packages: `packages/*`

When adding a dependency to a workspace package, use the `-w` flag to specify which workspace receives it:

```
npm install -w <workspace-name> some-package
```

## TypeScript & ESM

All packages use ESM (`"type": "module"`) with `allowImportingTsExtensions` enabled. Relative imports must include an explicit `.js` or `.ts` extension — the convention differs by package: `core-ai`, the middleware packages (`testing`, `langfuse`, `opentelemetry`, `axiom`), and `kimi` import with `.ts`; the other provider SDK packages import with `.js`. Match the package you are editing.

TypeScript configurations:

- **Base** (`base.json`): `module: "NodeNext"`, `moduleDetection: "force"`, target ES2022, strict mode
- **Node.js services** (`node.json`): base NodeNext with build output settings

## Commands

```bash
npm run build          # turbo build (all packages)
npm run test           # turbo test (unit tests, no API keys needed)
npm run lint           # turbo lint (eslint, --max-warnings 0)
npm run check-types    # turbo check-types (tsc --noEmit)
npm run release:check  # build + lint + check-types — CI additionally runs npm test
npm run format         # prettier --write
```

Single package / single test (unit tests use vitest per package):

```bash
npm run test -w @core-ai/anthropic                        # one package
npx vitest run packages/anthropic/src/chat-adapter.test.ts   # one file
npx vitest run packages/anthropic/src/chat-adapter.test.ts -t 'test name'
```

Note: `turbo test` depends on `^build`, so dependencies must be built; when running vitest directly in a provider package, build `@core-ai/core-ai` first if it changed (unit tests resolve it from `dist`). The e2e config instead aliases `@core-ai/core-ai` and `@core-ai/openai` to `src`, so e2e needs no build.

Live E2E tests (real API calls, separate from `npm run test`):

```bash
npm run test:e2e                  # all providers with configured keys
npm run test:e2e:anthropic        # one provider — also :anthropic-vertex, :openai, :openai:chat, :openai:compat,
                                  #   :azure-openai, :azure-openai:chat, :azure-openai:classic, :google, :google-vertex,
                                  #   :mistral, :omnifact, :kimi
```

Harness lives in `tests/e2e/` — one shared behavioral contract run against every provider adapter (see `tests/e2e/README.md` for env vars and model overrides).

Docs (Mintlify, in `docs/`): `npm run docs:dev`, `npm run docs:check-links`. See `docs/AGENTS.md` for doc style rules.

## Contributing

Before contributing changes, first read the `contributing` skill.

## Architecture

### Core package (`packages/core-ai`)

The provider-agnostic contract, **zero provider dependencies** (only zod). `types.ts` holds the whole domain model (`Message` union, `AssistantContentPart`, `ChatModel`/`EmbeddingModel`/`ImageModel`, `StreamEvent`, usage types); top-level functions (`generate`, `stream`, `generateObject`, `streamObject`, `embed`, `generateImage`) are thin delegators to the model methods. `base-stream.ts` is the generic streaming engine — streams are **eagerly started and replayable**, expose `.result` and `.events`, and own abort semantics; provider adapters just produce raw `StreamEvent`s. `wrap-chat-model.ts` (and embedding/image variants) implement the middleware API. Also load-bearing: `tool.ts` (`defineTool`), `provider-metadata.ts` (`getProviderMetadata`), `result-to-message.ts`.

### Provider packages (10)

Full implementations — `anthropic`, `openai`, `google-genai`, `mistral` — share one file pattern; mirror it when adding a provider or feature: `provider.ts` (`create<Provider>()` factory; accepts `apiKey`/`baseURL` or a pre-built SDK `client`), `chat-model.ts` (orchestration only), `chat-adapter.ts` (pure mapping between core-ai and native SDK types — the bulk of provider logic and tests), `model-capabilities.ts` (per-model-id capability lookup), `provider-options.ts` (typed `providerOptions.<provider>` escape hatch), plus `embedding-model.ts`/`image-model.ts` where supported.

The other six are thin wrappers: `azure-openai`, `omnifact`, `openai-compat`, and `kimi` re-configure `@core-ai/openai`; `anthropic-vertex` re-configures `@core-ai/anthropic`; `google-vertex` re-configures `@core-ai/google-genai`. `@core-ai/openai` defaults to the **Responses API** (Chat Completions lives in `src/chat-completions/`); its `./compat` subpath is deprecated — use `@core-ai/openai-compat` instead.

### Cross-provider invariants

- Part `metadata` is application-owned: adapters must ignore it and never serialize it to provider APIs.
- `providerMetadata` on reasoning parts is namespaced by provider key; adapters downgrade foreign reasoning blocks to plain text instead of forwarding opaque metadata.
- Usage normalization: `inputTokens` always includes cache reads/writes; `outputTokens` includes reasoning tokens.

### Supporting packages

`packages/testing` — internal shared test utilities (not published). `packages/langfuse` / `packages/opentelemetry` — observability middleware on the `wrap*Model` API; `packages/axiom` is an OTLP preset on top of `opentelemetry`. `packages/eslint-config` / `typescript-config` / `esbuild-config` — shared internal configs.

## Code Style

### General Conventions

- **Named exports** over default exports (default exports OK for single-purpose modules)
- **Function naming**: `create*` (factory), `get*` (retrieval), `handle*` (events)
- **Pure functions** preferred — avoid side effects where possible

### Functional Programming Approach

Always use functions instead of classes unless absolutely necessary.

```typescript
// Preferred
export function createRouter<TRoutes extends RouteMap>(
    config: RouterConfig,
    routes: TRoutes
): Router<TRoutes> {
    return {
        config,
        ...routes,
    };
}

// Avoid
export class RouterManager {
    createRouter() {
        /* ... */
    }
}
```

Classes are only acceptable for:

- Custom Error types with inheritance
- External library integration requiring class-based patterns

### Type Definitions

**No `any` types** — use generics, unions, or `unknown`:

```typescript
export function cloneItem<T>(item: T): T {
    return structuredClone(item);
}

export function formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}
```

**`type` over `interface`** — use `interface` only for declaration merging, extension, or public APIs that may need extension:

```typescript
// Default — type
export type RetryOptions = {
    maxAttempts: number;
    delayMs: number;
    backoff: 'linear' | 'exponential';
};

// Acceptable — interface when extending
export interface CacheProvider<TValue> extends StorageProvider {
    get: (key: string) => Promise<TValue | null>;
}
```

### Generics

Use generics extensively for type safety and reusability:

```typescript
export function createHandler<
    TInput extends Record<string, unknown>,
    TOutput extends ResponseShape<TInput>,
>(
    schema: Schema<TInput>,
    handler: HandlerFn<TInput, TOutput>
): RequestHandler<TInput, TOutput> {
    return { schema, handle: handler };
}
```

Strict type checking: `noUncheckedIndexedAccess: true`, `strict: true`. Avoid type assertions (`as`) unless absolutely necessary.

### Error Handling

Custom errors extend `Error` with meaningful messages:

```typescript
export class NotFoundError extends Error {
    constructor(resource: string, id: string) {
        super(`${resource} ${id} not found`);
        this.name = 'NotFoundError';
    }
}
```

### Constants and Configuration

Use `const` assertions for readonly config objects:

```typescript
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_CONFIG = {
    retries: 3,
    timeout: 5000,
    verbose: false,
} as const;
```

### Import Organization

- Local file imports: include an explicit `.js` or `.ts` extension, following the package's existing convention (see [TypeScript & ESM](#typescript--esm))
- Workspace package imports and npm packages: no extensions needed
- Check the target package's `package.json` exports before importing from workspace packages
- Every import must be declared in that package's `package.json` (`import/no-extraneous-dependencies`, internal workspace deps included)

Group imports in this order:

1. External packages (npm libraries)
2. Internal workspace packages
3. Relative imports (local modules, utilities)

```typescript
import { z } from 'zod';
import { getLogger } from '@workspace/logging';

import { createConnection } from '../database.js';
import { UserRole } from '../models/user.js';
```

### Linting

Every eslint warning blocks (`eslint-plugin-only-warn` + `--max-warnings 0`). Prefix intentionally unused identifiers with `_`.
