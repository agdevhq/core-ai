# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`core-ai` — a type-safe TypeScript abstraction layer over LLM provider SDKs (chat, streaming, structured output, tool calling, embeddings, image generation). Turborepo monorepo with npm workspaces, Node >= 22, all ESM.

Read `AGENTS.md` for code style conventions (functional over classes, `type` over `interface`, no `any`, named exports, import ordering). Read `.agents/skills/contributing/SKILL.md` before branching, committing, or opening PRs — branch naming (`feat/`, `fix/`, `chore/`, `refactor/`) and changeset rules live there. Other skills in `.agents/skills/`: `building-packages` (tsup/exports/build issues), `releasing-packages` (npm publishing), `mintlify` (docs site), `deslop` (run when finalizing a PR), `writing-plans`.

## Commands

```bash
npm run build          # turbo build (all packages)
npm run test           # turbo test (unit tests, no API keys needed)
npm run lint           # turbo lint (eslint, --max-warnings 0)
npm run check-types    # turbo check-types (tsc --noEmit)
npm run release:check  # build + lint + check-types — CI additionally runs npm test and requires a changeset
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
                                  #   :azure-openai, :azure-openai:chat, :azure-openai:classic, :google, :google-vertex, :mistral, :omnifact
```

Harness lives in `tests/e2e/` — one shared behavioral contract run against every provider adapter (see `tests/e2e/README.md` for env vars and model overrides).

Docs (Mintlify, in `docs/`): `npm run docs:dev`, `npm run docs:check-links`. See `docs/AGENTS.md` for doc style rules (document the status quo only, never mention past behavior).

## Changesets (required on every PR)

Every PR must include a changeset (`npm run changeset`, or `npx changeset --empty` for CI/docs/test-only changes). All publishable packages are a **fixed version group** — bumping one bumps all — but list every package with meaningful changes so each gets a changelog entry. Pre-1.0: use `minor` for breaking changes; `major` releases 1.0.0.

## Architecture

### Core package (`packages/core-ai`)

Defines the provider-agnostic contract and has **zero provider dependencies** (only zod):

- `types.ts` — the whole domain model: `Message` union (system/user/assistant/tool), `AssistantContentPart` (text | reasoning | tool-call), `ChatModel` / `EmbeddingModel` / `ImageModel` interfaces, `StreamEvent`, `ChatStream`, usage types.
- Top-level functions (`generate`, `stream`, `generateObject`, `streamObject`, `embed`, `generateImage`) are thin delegators to the corresponding model method.
- `base-stream.ts` (`createStream`) — the generic streaming engine: streams are **eagerly started and replayable** (buffered event history replays before live events), expose `.result` (aggregated final response, rejects on abort/failure) and `.events` (always resolves with observed events, even after abort), and own abort semantics (`StreamAbortedError`). `stream.ts` (`createChatStream`) and `stream-object.ts` are the chat/object reducers over it; provider adapters just produce raw `StreamEvent`s.
- `wrap-chat-model.ts` / `wrap-embedding-model.ts` / `wrap-image-model.ts` — middleware wrapping (`ChatModelMiddleware` etc.); middleware intercepts `generate`/`stream`/`generateObject`/`streamObject` with an `execute` continuation.
- Other load-bearing modules: `tool.ts` (`defineTool`), `provider-metadata.ts` (`getProviderMetadata` — the namespaced lookup adapters must use), `result-to-message.ts` (`resultToMessage`).

### Provider packages (9)

Full implementations — `anthropic`, `openai`, `google-genai`, `mistral` — follow the same file pattern; mirror it when adding a provider or feature:

- `provider.ts` — `create<Provider>()` factory returning `{ chatModel(id), embeddingModel(id), imageModel(id) }` (whichever are supported); accepts `apiKey`/`baseURL` or a pre-built SDK `client`.
- `chat-model.ts` — implements the `ChatModel` interface; orchestration only.
- `chat-adapter.ts` — pure mapping functions between core-ai types and the native SDK's request/response/stream-event types. The bulk of provider logic and tests live here.
- `model-capabilities.ts` — per-model-id capability lookup (reasoning support, allowed efforts, whether reasoning restricts sampling params). `clampReasoningEffort` in core maps unsupported efforts.
- `provider-options.ts` — typed `providerOptions.<provider>` escape-hatch settings.

Providers add `embedding-model.ts` / `image-model.ts` where supported (openai, google-genai; mistral: embeddings only) and a per-provider error file.

The other five are thin wrappers (essentially just `provider.ts`): `azure-openai`, `omnifact`, and `openai-compat` re-configure `@core-ai/openai`; `anthropic-vertex` re-configures `@core-ai/anthropic`; `google-vertex` re-configures `@core-ai/google-genai`.

`@core-ai/openai`'s default entry uses the OpenAI **Responses API**; the Chat Completions implementation lives in `src/chat-completions/`, with shared code in `src/shared/`. The `./compat` subpath (`src/compat/`) is **deprecated** — for OpenAI-compatible endpoints use `@core-ai/openai-compat`, or `createOpenAI().chat` for strict Chat Completions.

### Cross-provider invariants

- **Part `metadata`** is application-owned: adapters must ignore it and never serialize it to provider APIs.
- **`providerMetadata`** on reasoning parts is namespaced by provider key (`{ anthropic: {...} }`). An adapter detects foreign reasoning blocks by the absence of its own key and downgrades them to plain text instead of forwarding opaque metadata.
- **Usage normalization**: `inputTokens` is always the total including cache reads/writes (Anthropic's raw numbers are summed); `outputTokens` includes reasoning tokens.

### Supporting packages

- `packages/testing` — internal shared test utilities (not published).
- `packages/langfuse`, `packages/opentelemetry` — observability middleware built on the `wrap*Model` middleware API. `packages/axiom` is an OTLP exporter preset on top of `@core-ai/opentelemetry`.
- `packages/eslint-config`, `packages/typescript-config`, `packages/esbuild-config` — shared internal configs.

## Conventions gotchas

- Relative import extensions differ by package: `core-ai` and the middleware packages import with `.ts`; the provider SDK packages import with `.js`. Match the package you are editing — this overrides `AGENTS.md`'s blanket "always `.ts`" rule.
- Every eslint warning blocks (`eslint-plugin-only-warn` + `--max-warnings 0`). Prefix intentionally unused identifiers with `_`. Every import must be declared in that package's `package.json` (`import/no-extraneous-dependencies`, internal workspace deps included).
