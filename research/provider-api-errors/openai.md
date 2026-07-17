# OpenAI / Azure OpenAI — API error research

> **Fact-checked 2026-07-17** against official docs, openai-node source, Azure Foundry docs, and cited GitHub/community threads. Corrections from that pass are folded in below.

## Official documentation summary

- [Error codes guide](https://developers.openai.com/api/docs/guides/error-codes) — 401/403/429/500/503; distinguishes rate limit vs quota; 503 overloaded / “Slow Down”
- [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits) — `x-ratelimit-*` headers; exponential backoff
- [Rate-limit cookbook](https://developers.openai.com/cookbook/examples/how_to_handle_rate_limits) — real `RateLimitError` / `insufficient_quota` message templates
- [Streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses) — streaming `error` event; `response.failed` codes
- JS SDK: [`openai-node` error.ts](https://github.com/openai/openai-node/blob/master/src/core/error.ts) — status → exception class; `APIUserAbortError`, connection/timeout
- Azure: [Foundry quota / 429](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota) — quota vs system capacity throttling; `retry-after-ms`

## Error object shape

**REST (Chat Completions / most endpoints):**

```json
{
    "error": {
        "message": "<string>",
        "type": "<string>",
        "param": "<string|null>",
        "code": "<string|null>"
    }
}
```

SDK `APIError` flattens: `status`, `headers`, `code`, `type`, `param`, nested `error`.

**Azure divergences:** numeric `code: "429"`, `code: "NoCapacity"`, Responses V1 `param` as object `{ "retry_after": "30" }`.

Official Azure quota docs describe four 429 scenarios: rate limit exceeded, system capacity, temporary rate-limit adjustment, and token-budget / `max_tokens` estimation.

**Responses streaming `error` event — documented flat vs observed nested:**

Docs show flat `{ type, code, message, param, sequence_number }`. Live service often nests Chat-Completions-shaped `error` ([openai-dotnet#881](https://github.com/openai/openai-dotnet/issues/881)).

Responses `response.failed` uses a different shape (`ResponseError.code` enum including `server_error`, `rate_limit_exceeded`) than Chat Completions `error.type` / `error.code`. `wrapOpenAIError` only runs on thrown HTTP/SDK errors — not on streaming SSE event normalization inside adapters.

**Non-HTTP SDK classes:**

| Class                       | Default message        | Notes                                        |
| --------------------------- | ---------------------- | -------------------------------------------- |
| `APIUserAbortError`         | `Request was aborted.` | User `AbortSignal`                           |
| `APIConnectionTimeoutError` | `Request timed out.`   | Not abort                                    |
| `APIConnectionError`        | `Connection error.`    | Network                                      |
| `LengthFinishReasonError`   | length finish_reason   | Successful HTTP 200 — **not** context length |

## Catalog by category

### Abort

| Signal                                             | Confidence |
| -------------------------------------------------- | ---------- |
| `APIUserAbortError` / `name === 'AbortError'`      | High       |
| Do **not** map timeouts/connection errors to abort | High       |

### Context length

| Status | code                      | type                    | Message templates                                                                                                                  | Confidence |
| ------ | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 400    | `context_length_exceeded` | `invalid_request_error` | `This model's maximum context length is {N} tokens. However, you requested {M} tokens…` / `…your messages resulted in {M} tokens…` | High       |
| 400    | `context_length_exceeded` | same                    | `Input tokens exceed the configured limit of {N} tokens. Your messages resulted in {M} tokens…`                                    | High\*     |
| 400    | `context_length_exceeded` | same                    | Responses: `Your input exceeds the context window of this model…`                                                                  | High       |
| 400    | `string_above_max_length` | `invalid_request_error` | `Expected a string with maximum length {N}…`                                                                                       | High       |

\*Some live payloads carry this wording with `code: null` — classify via message regex when code is missing.

Token counts live in prose only. Prefer `code` over message parsing.

**Note:** `string_above_max_length` is a **per-field character limit** (e.g. tool description), not a token context-window error. Mapping it to `ContextLengthExceededError` is a wrapper design choice, broader than literal context overflow.

### Rate limit

| Status    | code / type           | Notes                                                                                                                                                                       | Confidence                                  |
| --------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 429       | `rate_limit_exceeded` | `type` often `"tokens"` or `"request"`, **not** always `rate_limit_error`                                                                                                   | High                                        |
| 429       | —                     | Message: `Rate limit reached for … on tokens per min (TPM)…` (retry wording varies: `Try again in {N}s` / `Please try again in {N}ms`)                                      | High                                        |
| 429 Azure | —                     | `Requests to the ChatCompletions_Create Operation under Azure OpenAI… exceeded token rate limit…`                                                                           | High                                        |
| Headers   | —                     | OpenAI: `x-ratelimit-*` (documented); `retry-after` seen in practice but **not** in the official header table. Azure: **`retry-after-ms`** (ms, documented) + `Retry-After` | High (Azure); Medium (OpenAI `Retry-After`) |

### Quota / billing (429 but not retryable)

| Status | code / type                                                   | Message                                                                        | Confidence |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| 429    | `code: insufficient_quota` **and** `type: insufficient_quota` | `You exceeded your current quota, please check your plan and billing details…` | High       |

JS SDK still throws `RateLimitError` for **all** HTTP 429 — inspect `code`/`type`. Cookbook shows both `code` and `type` equal to `insufficient_quota`.

### Overload / capacity

| Status    | Signal                                                   | Example                                                                                                              | Confidence |
| --------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| 503       | message                                                  | `That model is currently overloaded with other requests…`                                                            | High       |
| 503       | docs                                                     | `The engine is currently overloaded, please try again later`                                                         | High       |
| 503       | docs                                                     | `Slow Down` (traffic spike)                                                                                          | Medium     |
| 429 Azure | `code: NoCapacity`                                       | `The system is currently experiencing high demand… Please retry after {N} seconds…` (retry window sometimes omitted) | High       |
| 429 Azure | `message === "Backend error."` + `invalid_request_error` | Misleading `code: rate_limit_exceeded` — treat as unavailable/capacity                                               | High       |

### Service unavailable / 5xx

| Status                      | type                   | Notes                                                                                    | Confidence |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| 500/502/503/504             | `server_error` (often) | Common in practice, not a guaranteed invariant; overload wording → prefer overload class | High       |
| Responses `response.failed` | `code: server_error`   | Different shape from Chat Completions `error.type`                                       | High       |

## User-reported edge cases

1. `error.type` for 429 is often `"tokens"` / `"request"` — matching only `rate_limit_error` misses real limits ([openai-node#168](https://github.com/openai/openai-node/issues/168)). **Note:** `wrapOpenAIError` maps any HTTP 429 to `RateLimitError` via status, so it does not miss these; the real bugs are misclassifying `insufficient_quota` and Azure `NoCapacity` as retryable rate limits.
2. `insufficient_quota` shares HTTP 429 with rate limits (`type` and `code` both `insufficient_quota`).
3. Context-length message formats changed over time; `code` is stable when present.
4. Azure `NoCapacity` vs quota 429 — same status, different remediation.
5. Azure `"Backend error."` carries misleading `rate_limit_exceeded`.
6. Responses streaming error shape: nested vs flat docs mismatch.
7. Rate-limit headers may be dropped from serialized SDK errors (plausible when `Headers` is omitted by `JSON.stringify`; depends on logging path).
8. Timeout vs abort: internal timeout → `APIConnectionTimeoutError`, not abort.
9. `LengthFinishReasonError` ≠ context length (output truncation after 200).

## Recommended classification signals

Priority for `wrapOpenAIError`:

1. `APIUserAbortError` / `AbortError` → `AbortedError`
2. Structured codes:
    - `context_length_exceeded`, `string_above_max_length` → `ContextLengthExceededError`
    - `insufficient_quota` (`code` or `type`) → non-retryable `ProviderError` (not `RateLimitError`)
    - Azure `NoCapacity` → `ModelOverloadedError`
    - Azure `"Backend error."` + `invalid_request_error` → `ServiceUnavailableError` (**already handled**)
    - `rate_limit_exceeded` (excluding Azure backend case) / HTTP 429 → `RateLimitError`
3. HTTP 5xx + overload phrases → `ModelOverloadedError`, else `ServiceUnavailableError`
4. Message heuristics last (provider message, not SDK wrapper string)

**Phrase inventory (OpenAI platform, 5xx only):**

- `\boverloaded\b` (covers “That model is currently overloaded”, “engine is currently overloaded”)
- `\bhigh demand\b`, `running out of capacity`, `spikes in demand`

**Azure capacity on 429:**

- `code: NoCapacity`
- `/System is currently experiencing high demand/i`
- `/maximum usage size allowed during peak load/i`

**Retry-After:** prefer `retry-after-ms` → seconds, then `Retry-After`, then message `Please retry after N seconds` / Azure `param.retry_after`. Note: `getProviderErrorCode` / `getString` only read string `param` today — Azure Responses V1 object `param` is not parsed.

## Gaps vs current `wrapOpenAIError`

| Gap                                            | Status                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `insufficient_quota` → RateLimitError          | **Open** — any 429 → `RateLimitError` before code inspection           |
| Azure `NoCapacity`                             | **Open** — 429 → `RateLimitError`; overload heuristics exclude 429     |
| Only parse `retry-after`, not `retry-after-ms` | **Open** — `parseRetryAfterSeconds` reads `retry-after` only           |
| Responses nested streaming errors              | **Open** — no streaming event normalizer; wrap\* only on thrown errors |
| Azure `"Backend error."`                       | **Closed** — maps to `ServiceUnavailableError`                         |
| Overload phrases (“That model…”, “engine…”)    | **Closed** — `/\boverloaded\b/` already matches both                   |

## Sources

- https://developers.openai.com/api/docs/guides/error-codes
- https://developers.openai.com/api/docs/guides/rate-limits
- https://developers.openai.com/cookbook/examples/how_to_handle_rate_limits
- https://github.com/openai/openai-node/blob/master/src/core/error.ts
- https://github.com/openai/openai-node/issues/168
- https://github.com/openai/openai-dotnet/issues/881
- https://community.openai.com/t/status-code-503-that-model-is-currently-overloaded-with-other-requests/31433
- https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota
- https://learn.microsoft.com/en-us/answers/questions/5653265/rate-limit-error-new-azure-responses-api-v1
- https://learn.microsoft.com/en-gb/answers/questions/5647367/azure-openai-429-system-is-experiencing-high-deman
