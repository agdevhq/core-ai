# E2E Harness

This directory contains the shared provider end-to-end test harness.

## Purpose

The harness runs one shared behavioral contract against provider adapters:

- OpenAI
- Anthropic
- Google GenAI
- Mistral

The suite is live-only. Running the harness executes real provider API calls
for providers with configured API keys.

Failures in this harness can indicate provider implementation regressions or
provider/model incompatibilities. Treat failing cases as signal first, then
adjust model overrides only when needed.

## Run Commands

From repository root:

```bash
# Single harness entrypoint
npm run test:e2e
```

## Required Environment Variables

Provider keys:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `MISTRAL_API_KEY`

Optional model overrides:

- `OPENAI_E2E_CHAT_MODEL`
- `OPENAI_E2E_EMBED_MODEL`
- `OPENAI_E2E_IMAGE_MODEL`
- `ANTHROPIC_E2E_CHAT_MODEL`
- `GOOGLE_E2E_CHAT_MODEL`
- `GOOGLE_E2E_EMBED_MODEL`
- `GOOGLE_E2E_IMAGE_MODEL`
- `MISTRAL_E2E_CHAT_MODEL`
- `MISTRAL_E2E_EMBED_MODEL`

## Add a New Provider Adapter

1. Create `src/adapters/<provider>.adapter.ts`.
2. Implement the `ProviderE2EAdapter` contract from
   `src/adapters/provider-adapter.ts`.
3. Set capability flags (`chat`, `stream`, `object`, `embedding`, `image`).
4. Add API-key readiness checks in `isConfigured`.
5. Register the adapter in `src/index.e2e.test.ts`.

If a provider is unsupported for a capability, set its capability to `false`.
The shared contract runner will automatically skip those cases.

## Source Layout

- `src/index.e2e.test.ts` - test entrypoint
- `src/providers.ts` - provider registration list
- `src/provider-suite.ts` - suite registration logic
- `src/provider-cases.ts` - shared provider contract cases
- `src/adapters/*` - provider-specific adapter implementations
