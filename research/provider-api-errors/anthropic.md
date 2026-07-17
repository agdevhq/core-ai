# Anthropic — API error research

Covers Messages API and Anthropic on Vertex (Google error envelope).

> **Fact-checked 2026-07-17** against official Anthropic docs, Vertex API errors, anthropic-sdk-typescript / python source, and cited issues. Corrections from that pass are folded in below.

## Official documentation summary

- [Errors](https://platform.claude.com/docs/en/api/errors) — HTTP status → `error.type`; JSON envelope with `type: "error"`, nested `error`, `request_id`
- Status map: `400 invalid_request_error`, `401 authentication_error`, `402 billing_error`, `403 permission_error`, `404 not_found_error`, `409 conflict_error`, `413 request_too_large`, `429 rate_limit_error`, `500 api_error`, `504 timeout_error`, **`529 overloaded_error`**
- [Rate limits](https://platform.claude.com/docs/en/api/rate-limits) — RPM/ITPM/OTPM; `retry-after`; `anthropic-ratelimit-*` headers; acceleration limits; 529 = fleet capacity
- [Streaming error events](https://platform.claude.com/docs/en/build-with-claude/streaming#error-events) — SSE `event: error` after HTTP 200; example `overloaded_error` / `"Overloaded"`
- [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) — input too long → 400 `"prompt is too long"`; Claude 4.5+ soft overflow via `stop_reason: model_context_window_exceeded` (not HTTP error)
- Vertex: [API errors](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/api-errors) — `429 RESOURCE_EXHAUSTED`, `503 UNAVAILABLE`, `499 CANCELLED`, etc.
- Compliance API also documents 502/503 retry-with-backoff ([Compliance errors](https://platform.claude.com/docs/en/manage-claude/compliance-errors)); main Messages errors page lists 500/504/529 explicitly, not 502/503.

## Error object shape

**Direct Anthropic API:**

```json
{
    "type": "error",
    "error": {
        "type": "not_found_error",
        "message": "The requested resource could not be found."
    },
    "request_id": "req_…"
}
```

**Streaming (HTTP 200):**

```sse
event: error
data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}
```

**TS SDK classes** ([error.ts](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/core/error.ts)):

| Class                                              | When                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `APIUserAbortError`                                | User cancel — `"Request was aborted."`                                                          |
| `RateLimitError`                                   | 429                                                                                             |
| `InternalServerError`                              | **status ≥ 500 including 529 and 504** — no dedicated OverloadedError in TS                     |
| `APIError` (generic)                               | 402 / 413 and other non-specialized statuses — no dedicated billing / request-too-large classes |
| `APIConnectionError` / `APIConnectionTimeoutError` | No HTTP response                                                                                |

Python SDK has dedicated `OverloadedError` (529), `RequestTooLargeError` (413). No dedicated billing class for 402 in either SDK.

TS SDK also exposes `APIError.type` (parsed from nested `error.type`). Prefer that over re-parsing the envelope.

**Vertex Google body** (single-level, not Anthropic double-nest):

```json
{
    "error": {
        "code": 429,
        "message": "Quota exceeded for aiplatform.googleapis.com/…",
        "status": "RESOURCE_EXHAUSTED"
    }
}
```

## Catalog by category

### Abort

| Signal                                         | Confidence                                      |
| ---------------------------------------------- | ----------------------------------------------- |
| `APIUserAbortError` — `"Request was aborted."` | High                                            |
| `error.name === 'AbortError'`                  | High                                            |
| Vertex `499 CANCELLED`                         | Medium — Vertex-specific; not always user abort |

### Context length

| Status | type                    | Message                                                          | Confidence                                             |
| ------ | ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| 400    | `invalid_request_error` | `prompt is too long: {actual} tokens > {max} maximum`            | High                                                   |
| 400    | `invalid_request_error` | `prompt is too long: {actual} tokens > {max}`                    | High                                                   |
| 400    | `invalid_request_error` | `prompt is too long` (no counts)                                 | High                                                   |
| 400    | `invalid_request_error` | `Input tokens exceed the context limit of {N} for model …`       | Medium — widely cited, not in official Anthropic docs  |
| 400    | `invalid_request_error` | `input length and max_tokens exceed context limit: A + B > C`    | Medium — secondary sources; matches pre-4.5 validation |
| 413    | `request_too_large`     | Byte/request size (32 MB) — **not** token window                 | High                                                   |
| 200    | —                       | `stop_reason: model_context_window_exceeded` — not an HTTP error | High                                                   |

### Rate limit

| Status     | type                 | Notes                                        | Confidence |
| ---------- | -------------------- | -------------------------------------------- | ---------- |
| 429        | `rate_limit_error`   | `retry-after` header; ITPM/RPM messages      | High       |
| 429 Vertex | `RESOURCE_EXHAUSTED` | Quota or shared capacity (ambiguous)         | High       |
| Headers    | —                    | `anthropic-ratelimit-*-remaining`, `*-reset` | High       |

### Overload / capacity

| Status               | type                               | Message                            | Confidence |
| -------------------- | ---------------------------------- | ---------------------------------- | ---------- |
| **529**              | `overloaded_error`                 | `"Overloaded"`                     | High       |
| SSE error (HTTP 200) | `overloaded_error`                 | same                               | High       |
| TS SDK               | `InternalServerError` + status 529 | Must check `error.type`, not class | High       |

529 = platform capacity; 429 = org quota/acceleration. Docs document `retry-after` for 429; 529 compliance guidance says “retry with backoff” but does not mention `retry-after` (absence is a reasonable inference, not proven).

### Service unavailable / 5xx

| Status     | type                | Notes                                                  | Confidence |
| ---------- | ------------------- | ------------------------------------------------------ | ---------- |
| 500        | `api_error`         | May include `x-should-retry`                           | High       |
| 504        | `timeout_error`     | Distinct API type; TS still uses `InternalServerError` | High       |
| 502/503    | —                   | Documented for Compliance API; retry with backoff      | Medium     |
| Vertex 503 | `UNAVAILABLE`       | —                                                      | High       |
| Vertex 504 | `DEADLINE_EXCEEDED` | —                                                      | High       |

### Other notable

| Status              | type                | Notes                                          |
| ------------------- | ------------------- | ---------------------------------------------- |
| 401/402/403/404/409 | matching `*_error`  | Auth, billing, permission, not found, conflict |
| 413                 | `request_too_large` | Bytes, not tokens → `ProviderError`            |

## User-reported edge cases

1. **Streaming overload status lost in TS SDK** ([#346](https://github.com/anthropics/anthropic-sdk-typescript/issues/346)) — **fixed 2024-09** ([PR #524](https://github.com/anthropics/anthropic-sdk-typescript/pull/524)). Current behavior: mid-stream SSE errors throw `APIError` with `status: undefined`, populated `.type` (e.g. `overloaded_error`), and a JSON-stringified body message (often contains `"Overloaded"`). No longer surfaces as `APIConnectionError`. Still requires checking `.type` / message, not exception class alone.
2. Mid-stream errors keep HTTP 200 — branch on `error.type` ([Python #1258](https://github.com/anthropics/anthropic-sdk-python/issues/1258)). Issue closed, but current Python `_streaming.py` still passes the HTTP 200 response into `_make_status_error`, so SSE `overloaded_error` may become `APIStatusError(status_code=200)` rather than `OverloadedError(529)`.
3. Community Claude Code mirrors check `message.includes('"type":"overloaded_error"')` — pattern is plausible; official `anthropics/claude-code` source not publicly verifiable.
4. Acceleration limits → 429 under nominal quotas.
5. Vertex `RESOURCE_EXHAUSTED` can be quota **or** overload; entitlement 0→0 is non-retryable ([Python #963](https://github.com/anthropics/anthropic-sdk-python/issues/963) — user report, not official policy).
6. False positive: `rate_limit_error` message mentioning “prompt is too long” must **not** classify as context (Zed tests). **`wrapAnthropicError` currently violates this** — context matching runs before rate-limit checks and does not exclude `rate_limit_error`.
7. Soft context overflow on Claude 4.5+ is not an HTTP error.

## Recommended classification signals

1. **AbortedError** — `APIUserAbortError` / `AbortError`
2. **ContextLengthExceededError** — `invalid_request_error` + `/prompt is too long/i` (parse counts when present). Exclude `413` / `request_too_large`. **Exclude `rate_limit_error`.**
3. **ModelOverloadedError** — `status === 529` OR `APIError.type === 'overloaded_error'` OR (streaming) overload wording / JSON type in message when status is undefined. Optional `\boverloaded\b` only on 5xx/529 / undefined status.
4. **RateLimitError** — `429` / `rate_limit_error` / Vertex `RESOURCE_EXHAUSTED`; attach `retry-after`
5. **ServiceUnavailableError** — 500/502/503/504 excluding 529; Vertex `UNAVAILABLE` / `DEADLINE_EXCEEDED`
6. **ProviderError** — else

**SDK note:** TS maps 529 (and 504) to `InternalServerError` — always check `error.type === 'overloaded_error'` (prefer `APIError.type`, not envelope re-parse).

## Gaps vs current `wrapAnthropicError`

| Gap                                                      | Status                                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming overload without status                        | **Partially closed** — works via `\boverloaded\b` matching `"Overloaded"` in JSON message post-#524. Prefer reading `APIError.type` instead of fragile message / envelope parse. |
| `getAnthropicErrorType` envelope                         | **Open** — can read outer `"error"` instead of inner type; should use `APIError.type` or `error.error.error.type`                                                                |
| `rate_limit_error` + “prompt is too long” false positive | **Open bug** — report recommends excluding; code does not                                                                                                                        |
| Alternate context messages                               | **Open** — only `prompt is too long` matched; `Input tokens exceed the context limit…` → `ProviderError`                                                                         |
| Vertex nesting                                           | **Open** — single-level `{error:{code,status}}` not handled; helpers require double-nested `error.error.*`                                                                       |
| Soft `stop_reason` overflow                              | Out of scope for wrap\*Error (success path)                                                                                                                                      |
| 413 `request_too_large`                                  | By design → `ProviderError` (not context length)                                                                                                                                 |

## Sources

- https://platform.claude.com/docs/en/api/errors
- https://platform.claude.com/docs/en/api/rate-limits
- https://platform.claude.com/docs/en/build-with-claude/streaming#error-events
- https://platform.claude.com/docs/en/build-with-claude/context-windows
- https://platform.claude.com/docs/en/manage-claude/compliance-errors
- https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/api-errors
- https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/core/error.ts
- https://github.com/anthropics/anthropic-sdk-typescript/issues/346
- https://github.com/anthropics/anthropic-sdk-typescript/pull/524
- https://github.com/anthropics/anthropic-sdk-python/issues/1258
- https://github.com/anthropics/anthropic-sdk-python/issues/963
- https://github.com/pydantic/pydantic-ai/issues/4060
- https://github.com/zed-industries/zed/blob/main/crates/anthropic/src/anthropic.rs
