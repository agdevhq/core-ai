# Mistral — API error research

> **Fact-checked 2026-07-17** against the official error glossary / known limitations, `@mistralai/mistralai` (client-ts) source, and cited GitHub issues/PRs. Corrections from that pass are folded in below.

## Official documentation summary

- [Error glossary](https://docs.mistral.ai/resources/error-glossary) — 400/401/403/404/422/429/500/502/503/504; types include `invalid_request_error`, `authentication_error`, `rate_limit_error`, `server_error`; retry 429+5xx; honor `Retry-After` on 429
- [Known limitations](https://docs.mistral.ai/resources/known-limitations) — context overflow → **400**; rate limit → **429**; `X-RateLimit-Remaining`
- **No HTTP 529** in official docs (Anthropic-specific). Overload is **503-centric**.
- SDK: [`@mistralai/mistralai`](https://github.com/mistralai/client-ts) — `MistralError` (`statusCode`, `body`, `headers`), `RequestAbortedError`, `RequestTimeoutError`, `SDKError`, plus `HTTPValidationError` (422 + `detail[]`), `ConnectionError` / `UnexpectedClientError`

## Error object shape

```json
{
    "object": "error",
    "message": "A human-readable description of the error.",
    "type": "invalid_request_error",
    "param": "model",
    "code": "unknown_model"
}
```

| Field             | Notes                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`         | String in glossary. On 422 proxy/OpenAI-compat paths, often a **JSON string** embedding FastAPI `detail[]` (e.g. `'{"detail":[…]}'`), not a nested object field. TS SDK parses native 422 into `HTTPValidationError` with top-level `detail[]`. |
| `type`            | May be **absent** on some 429 bodies. Production also uses `invalid_request_invalid_args` (context overflow) — **not listed** in the glossary’s four-value `type` table.                                                                        |
| `code`            | String/numeric (`"3051"`, `"1000"`) — real but not a stable taxonomy for classification                                                                                                                                                         |
| `raw_status_code` | Seen in wild; mirrors HTTP — not in glossary                                                                                                                                                                                                    |

**SDK:** prefer `error.body` JSON over embedded SDK error strings. Current `SDKError.message` format is `Status {n}. Body: {json}` ([sdkerror.ts](https://github.com/mistralai/client-ts/blob/main/src/models/errors/sdkerror.ts)). Older SDKs / `HTTPValidationError` used `API error occurred: Status {n}…` — do not rely on that prefix.

**Retries:** SDK retries `429,500,502,503,504`; honors `Retry-After` as integer seconds **or HTTP-date**. Note: core-ai `parseRetryAfterSeconds` currently only parses integer seconds.

## Catalog by category

### Abort

| Signal                                                | Confidence                      |
| ----------------------------------------------------- | ------------------------------- |
| `RequestAbortedError` — `"Request aborted by client"` | High                            |
| `AbortError` name                                     | High                            |
| `RequestTimeoutError` — `"Request timed out"`         | High as timeout — **not** abort |

### Context length

| Status | type                                                     | Message                                                                                                  | Confidence                                                |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 400    | `invalid_request_error` / `invalid_request_invalid_args` | `Prompt contains {N} tokens and {M} draft tokens, too large for model with {max} maximum context length` | High                                                      |
| 400    | same                                                     | `Prompt is too large for model`                                                                          | Medium                                                    |
| 400    | —                                                        | Community: `The number of tokens in the prompt exceeds the model's maximum context length of {N}…`       | Medium — third-party libraries; not official Mistral docs |

Reliable cue: case-insensitive **`too large for model`**. Regex: `/(\d+)\s*tokens.*too large for model with (\d+) maximum context length/`.

Do not treat generic 400/422 as context length.

### Rate limit

| Status  | type                              | Message                                | Confidence    |
| ------- | --------------------------------- | -------------------------------------- | ------------- |
| 429     | `rate_limit_error` (when present) | `Requests rate limit exceeded`         | High          |
| 429     | type may be absent                | Status alone is enough                 | High          |
| Headers | —                                 | `Retry-After`; `X-RateLimit-Remaining` | High / Medium |

**Not rate limit:** 503 `"service tier capacity exceeded"` — PR author claiming Mistral authorship says this is **backend capacity**, not user RPM/TPM ([litellm PR #25078](https://github.com/BerriAI/litellm/pull/25078) comment). Strong secondary evidence; **not** in official docs.

### Overload / capacity

| Status | Signal                                                    | Confidence                                                                              |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 503    | Official: temporarily **overloaded** or under maintenance | High (status); Low (exact body)                                                         |
| 503    | `service tier capacity exceeded`                          | High — map to **ServiceUnavailable**, not rate limit or overload-unless-message-matches |
| 503    | `unreachable_backend - Internal server error`             | Medium                                                                                  |
| 5xx    | `\boverloaded\b` in message                               | Medium — reasonable heuristic; not a documented body string                             |
| 529    | Third-party only (e.g. prism-php mapping)                 | **Low** — ignore unless confirmed; glossary/SDK HTTPStatus enum have no 529             |

### Service unavailable / 5xx

| Status          | Notes                                                          | Confidence |
| --------------- | -------------------------------------------------------------- | ---------- |
| 500/502/503/504 | Retryable; `server_error` when typed                           | High       |
| 504             | Timeout under load / long prompts — **not** context-length 400 | High       |

### Other notable

| Status  | type                                        | Notes                                                                                                                                                                 |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401     | `authentication_error`                      | —                                                                                                                                                                     |
| 403/404 | —                                           | Permission / model not found                                                                                                                                          |
| 422     | `internal_error_proxy` / FastAPI `detail[]` | Extra params from OpenAI-compat clients / proxies                                                                                                                     |
| 400     | `invalid_request_invalid_args`              | Feature not enabled (FIM, reasoning mode) — not context; also used for context overflow in [client-python#502](https://github.com/mistralai/client-python/issues/502) |

## User-reported edge cases

1. 429 body without `type` — rely on status.
2. 503 capacity misclassified as rate limit by aggregators — don’t.
3. `message` not always a clean string (422 often embeds stringified JSON).
4. `raw_status_code` duplicates HTTP status when proxying.
5. SDK auto-retry on 429 can amplify storms (operational concern, not documented Mistral behavior).
6. HTTP 529 on Mistral unconfirmed in official docs.
7. 504 ≠ context length.
8. Timeout ≠ abort in SDK.

## Recommended classification signals

1. **AbortedError** — `RequestAbortedError` / `AbortError` (not `RequestTimeoutError`)
2. **ContextLengthExceededError** — `/too large for model/i` + type in `{invalid_request_error, invalid_request_invalid_args, undefined}` on ~400
3. **ModelOverloadedError** — 5xx + `\boverloaded\b` only; **exclude 429**
4. **RateLimitError** — `429` or `type === 'rate_limit_error'`; attach `Retry-After`
5. **ServiceUnavailableError** — remaining 5xx (including `service tier capacity exceeded` without “overloaded”)
6. **ProviderError** — else (including undecided `RequestTimeoutError` semantics)

## Gaps vs current `wrapMistralError`

| Gap                                                                      | Status                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `service tier capacity exceeded`                                         | **Behavior OK** — lands in `ServiceUnavailableError` if no “overloaded”; **add explicit test**         |
| Alternate context wording (`exceeds the model's maximum context length`) | **Open** — only `too large for model` matched                                                          |
| `RequestTimeoutError`                                                    | **Open** — falls through to `ProviderError`; decide product semantics                                  |
| 422 `message` hardening                                                  | **Open** — `getString()` drops non-string; stringified JSON in `message` not parsed for `type`/content |
| HTTP-date `Retry-After`                                                  | **Open** in core-ai helper — SDK parses dates; `parseRetryAfterSeconds` only handles integer seconds   |

## Sources

- https://docs.mistral.ai/resources/error-glossary
- https://docs.mistral.ai/resources/known-limitations
- https://github.com/mistralai/client-ts
- https://github.com/mistralai/client-python/issues/502
- https://github.com/pydantic/pydantic-ai/issues/1885
- https://github.com/BerriAI/litellm/pull/25078
- https://github.com/BerriAI/litellm/issues/1471
- https://github.com/prism-php/prism/pull/959
