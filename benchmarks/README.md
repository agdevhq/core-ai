# Benchmarks

Lean latency/throughput benchmark for all supported `@core-ai` providers —
plus any OpenAI-compatible endpoint via `--base-url`. Every provider is
measured through `@core-ai/openai/compat` against its OpenAI-compatible
endpoint (client retries disabled), so the numbers compare like for like.

## Run

From the repository root:

```bash
# All registered providers (requires every provider's API key)
npx tsx benchmarks/run.ts

# A subset of providers, more runs
npx tsx benchmarks/run.ts --provider openai,anthropic,mistral --runs 10

# Multiple models per provider (comma-separated)
npx tsx benchmarks/run.ts --provider openai --model gpt-5-mini,gpt-5.2

# Ad-hoc provider (reads MYHOST_API_KEY)
npx tsx benchmarks/run.ts --name myhost --base-url https://llm.example.com/v1 --model llama-3.3-70b

# Machine-readable output
npx tsx benchmarks/run.ts --json > bench.json
```

See `npx tsx benchmarks/run.ts --help` for all flags.

## Providers

Registered in `providers.ts` — adding one is a single object literal:

```ts
{ name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' }
```

The registry mirrors the providers with `@core-ai` packages:

| Provider       | Endpoint                                              | Default model          | Env vars                                                                 |
| -------------- | ----------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `openai`       | `https://api.openai.com/v1`                           | `gpt-5-mini` (minimal) | `OPENAI_API_KEY`                                                          |
| `azure-openai` | `$AZURE_OPENAI_ENDPOINT/openai/v1`                    | `gpt-5-mini` (minimal) | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`                           |
| `anthropic`    | `https://api.anthropic.com/v1`                        | `claude-haiku-4-5`     | `ANTHROPIC_API_KEY`                                                       |
| `google`       | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash` | `GOOGLE_API_KEY`                                                          |
| `mistral`      | `https://api.mistral.ai/v1`                           | `mistral-large-latest` | `MISTRAL_API_KEY`                                                         |
| `omnifact`     | `https://connect.omnifact.ai/v1/gateway`              | `eu/gpt-5-mini`        | `OMNIFACT_API_KEY`                                                        |

API keys are read from `<NAME>_API_KEY` (uppercased, `-` → `_`; override with
`apiKeyEnv`), loaded from the root `.env`.

Azure OpenAI has no shared API endpoint: every Azure OpenAI resource gets its
own URL, and models are not addressed by model id but by the name you chose
when deploying a model into that resource. `AZURE_OPENAI_ENDPOINT` is the
resource URL from the Azure portal (e.g.
`https://my-resource.openai.azure.com`) — the benchmark appends `/openai/v1`,
Azure's OpenAI-compatible v1 API path. The `model` is sent as the deployment
name: the registry default assumes a deployment named `gpt-5-mini` exists;
target a different deployment with `--model <deployment-name>` (which also
clears the default `reasoningEffort`, since only you know whether that
deployment is a reasoning model).

For reasoning models, set `reasoningEffort: 'minimal'` on the spec (or pass
`--reasoning-effort minimal`) so runs measure serving latency instead of
thinking time — at default effort a model like `gpt-5-mini` thinks for
thousands of hidden tokens before the first visible one. Leave it unset for
models that reject `reasoning_effort`. Two caveats: the compat adapter clamps
the effort to the model's supported range (unknown model ids clamp `minimal`
up to `low`), and a `--model` override clears the registry entry's
`reasoningEffort` since it was tuned for the original model.

Ad-hoc providers (`--base-url`) also require their `<NAME>_API_KEY`; for
keyless local endpoints set a dummy value (e.g. `ADHOC_API_KEY=none`). All entries use each vendor's
OpenAI-compatible endpoint so every provider is measured over the same
protocol.

## Metrics

- **ttft** — time from request start to the first text or reasoning delta.
  Median and p95 across runs.
- **tok/s** — decode throughput over the visible generation window:
  `(streamedTokens - 1) / (tLast - tFirst)`. Reasoning tokens that are
  reported in usage but never streamed (hidden thinking, e.g. OpenAI Chat
  Completions) are excluded — they happen before the first visible delta and
  are part of TTFT; when a gateway hides thinking without reporting a
  breakdown, streamed tokens are estimated from characters (`~` prefix).
  Shows `—` for buffered/bursty streams that flush everything moments after
  the first delta — a tiny window would measure flush speed, not decode
  speed. The e2e figure is the reliable comparison in that case.
- **e2e tok/s** — `outputTokens / totalTime`, including TTFT.
- **out tok** — output tokens from stream usage. When a provider omits usage,
  tokens are estimated from characters and values are prefixed with `~`.
- **reasoning** — median share of output tokens spent thinking; column only
  appears when non-zero.
- **ok** — successful runs / measured runs. Warmup runs are discarded.

Runs are strictly sequential to avoid self-inflicted rate limiting.
