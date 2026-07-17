# Provider API error research

Research notes for structured `ProviderError` classification (`feat/structured-provider-errors`).

Compiled from official docs, SDK source, and user-reported payloads (forums, GitHub issues, help desks). Goal: ground `wrap*Error` heuristics in real signals — prefer structured `code`/`type`/HTTP status over shared English phrase bags.

> **Fact-checked 2026-07-17** — each provider doc was re-verified against primary sources. Cross-cutting claims below and the gaps table incorporate those corrections. See per-provider docs for detailed verdicts.
>
> **Implementation update 2026-07-17** — P0 gaps closed in wrappers / shared retry-after helpers (see status column).

| Provider                       | Document                             |
| ------------------------------ | ------------------------------------ |
| OpenAI / Azure OpenAI          | [openai.md](./openai.md)             |
| Anthropic (+ Vertex Anthropic) | [anthropic.md](./anthropic.md)       |
| Google GenAI / Vertex Gemini   | [google-genai.md](./google-genai.md) |
| Mistral                        | [mistral.md](./mistral.md)           |

## Cross-cutting findings

1. **HTTP status alone is insufficient** — especially 429 (rate limit vs quota vs capacity) and 503 (overload vs generic unavailable).
2. **Abort ≠ timeout ≠ connection error** — SDKs expose distinct classes; only user abort should map to `AbortedError`.
3. **Streaming errors often keep HTTP 200** — classify from nested `error.type` / event body, not status. (Google also has non-200 stream open failures; prefix + JSON message shapes vary by SDK.)
4. **Quota/billing on 429 is not retryable** — OpenAI `insufficient_quota`, some Google free-tier / entitlement cases.
5. **Provider capacity often looks like rate limit** — Azure `NoCapacity` / `"Backend error."`, Google `MODEL_CAPACITY_EXHAUSTED` on 429 **and** 503, Mistral `"service tier capacity exceeded"` on 503.

## Gaps vs current wrappers (high priority)

| Gap                                        | Provider     | Research recommendation                                          | Status                                                            |
| ------------------------------------------ | ------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `insufficient_quota` on 429                | OpenAI       | Non-retryable `ProviderError` (or dedicated billing error)       | **Closed** — plain `ProviderError`                                |
| Azure `NoCapacity`                         | OpenAI/Azure | `ModelOverloadedError`                                           | **Closed**                                                        |
| Azure `retry-after-ms`                     | OpenAI/Azure | Parse ms header                                                  | **Closed** — shared `parseRetryAfterSeconds`                      |
| Responses streaming nested `error`         | OpenAI       | Normalize nested event shape                                     | **Closed** for thrown/nested body extraction (no adapter rewrite) |
| Azure `"Backend error."`                   | OpenAI/Azure | `ServiceUnavailableError`                                        | **Closed**                                                        |
| OpenAI overload phrases                    | OpenAI       | —                                                                | **Closed** — `/\boverloaded\b/`                                   |
| Streaming SSE overload (status lost)       | Anthropic    | Prefer `APIError.type`                                           | **Closed** — prefer `APIError.type`                               |
| `rate_limit_error` + “prompt is too long”  | Anthropic    | Exclude `rate_limit_error` before context match                  | **Closed**                                                        |
| Vertex single-level Google envelope        | Anthropic    | Handle `{error:{code,status}}`                                   | **Closed**                                                        |
| 499 CANCELLED as abort                     | Google       | Do **not** treat all 499 as abort                                | **Closed** — stays `ProviderError` (by design)                    |
| Capacity on 429 (`No capacity available…`) | Google       | Keep as rate limit; don't overload-match on 429                  | **Correct**                                                       |
| Alternate Google context template          | Google       | Add `Unable to submit request because the input token count is…` | **Closed**                                                        |
| Streaming prefix / `throttled` on 5xx      | Google       | Strip `got status:` prefixes; match Vertex 500 throttled wording | **Closed**                                                        |
| `"service tier capacity exceeded"`         | Mistral      | `ServiceUnavailableError`; do **not** map to rate limit          | **Closed** — explicit regression test                             |

## Confidence legend

Used in per-provider catalogs:

- **High** — official docs and/or verified primary payloads
- **Medium** — widely cited / SDK tests / secondary but consistent
- **Low** — single third-party report or unverified template
