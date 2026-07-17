# Google GenAI / Vertex Gemini — API error research

> **Fact-checked 2026-07-17** against Gemini troubleshooting, Vertex API errors / retry strategy / 429 quota docs, `@google/genai` source, and cited GitHub/forum threads. Corrections from that pass are folded in below.

## Official documentation summary

- [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) — HTTP → `google.rpc` status; retry on 429/503/408/5xx
- [Vertex API errors](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/api-errors) — richer causes; **429 can mean quota OR shared-capacity overload**; 500 example: _“Request is throttled, because the service is temporarily overloaded.”_
- [Vertex 429 quota framework](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/error-code-429) — pay-as-you-go vs Provisioned Throughput messages; sub-PT usage may surface capacity errors as **5xx** not 429
- [Retry strategy](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/retry-strategy) — default retry: `408,429,500,502,503,504` (**not 499**)
- SDK: [`@google/genai`](https://github.com/googleapis/js-genai) — `ApiError` in [`errors.ts`](https://github.com/googleapis/js-genai/blob/main/src/errors.ts) is a thin wrapper; **JSON-stringify of the body into `message` happens in `_api_client.ts`** (`throwErrorIfNotOK` unary; stream chunk handler for streaming)

## Error object shape

**REST envelope:**

```json
{
    "error": {
        "code": 429,
        "message": "Resource has been exhausted (e.g. check quota).",
        "status": "RESOURCE_EXHAUSTED",
        "details": [
            /* QuotaFailure, ErrorInfo, … */
        ]
    }
}
```

`ErrorInfo` reason codes observed in the wild include `QUOTA_EXHAUSTED`, `MODEL_CAPACITY_EXHAUSTED`, `rateLimitExceeded` — richer structured signals than message text alone. Retry delay often appears as `RetryInfo.retryDelay` in body details, not only as a `Retry-After` header.

**`@google/genai` unary:** `ApiError.message = JSON.stringify(errorBody)`.

**Streaming prefixes vary by SDK / path** (always: prefix + JSON body; parse after first `{`):

| SDK / path              | Example prefix                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| js-genai (current main) | `got status: UNAVAILABLE. {…}` — RPC enum name                        |
| Older / alternate paths | `got status: 503 Service Unavailable. {…}` — HTTP status + statusText |
| Python `google-genai`   | `503 UNAVAILABLE. {…}` — `{code} {status}. {details}`                 |

**Deprecated `@google/generative-ai`:** human-readable message + `GoogleGenerativeAIAbortError` for fetch abort (`Request aborted when fetching …`) and stream abort (`Request aborted when reading from the stream`).

## Catalog by category

### Abort

| Signal                                                                         | Confidence                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| `AbortError` name; messages: `the operation was aborted`, `request aborted`, … | High                                            |
| Deprecated SDK: `Request aborted when fetching …` / stream read abort          | High                                            |
| HTTP **499** `CANCELLED` — _“The operation was cancelled.”_                    | High as status; **Medium** as true client abort |

Docs say cancelled “typically by the caller”; users report 499 during peak load as **server-side** transient failure (sometimes alleged to have been 429 — unverified officially). Do **not** map all 499 → `AbortedError`. Retry strategy excludes 499.

### Context length

| Status | status enum         | Message template                                                                                   | Confidence                                           |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 400    | `INVALID_ARGUMENT`  | `The input token count ({actual}) exceeds the maximum number of tokens allowed ({max}).`           | High                                                 |
| 400    | `INVALID_ARGUMENT`  | `Unable to submit request because the input token count is {N} but model only supports up to {M}…` | High — user-reported payload, not in official tables |
| 400    | `INVALID_ARGUMENT`  | Doc: _“Request exceeds the model's input token limit.”_                                            | High                                                 |
| 500    | `INTERNAL`          | Doc cause: _“Your input context is too long.”_ (message often generic)                             | Medium                                               |
| 504    | `DEADLINE_EXCEEDED` | Doc: large prompt timeout                                                                          | Medium                                               |

Empty counts observed: `The input token count () exceeds…` ([gemini-cli#10393](https://github.com/google-gemini/gemini-cli/issues/10393)). Wrong context limit in 400 message (routing quirk) remains anecdotal.

### Rate limit / quota

| Status        | status enum          | Message                                                                         | Confidence |
| ------------- | -------------------- | ------------------------------------------------------------------------------- | ---------- |
| 429           | `RESOURCE_EXHAUSTED` | `Resource has been exhausted (e.g. check quota).`                               | High       |
| 429           | same                 | `You exceeded your current quota… Please retry in {N}s.` + quota metric details | High       |
| 429 Vertex    | same                 | `Resource exhausted, please try again later.`                                   | High       |
| 429 Vertex PT | same                 | `Too many requests. Exceeded the Provisioned Throughput.`                       | High       |
| 429           | same                 | `No capacity available for model …` + `MODEL_CAPACITY_EXHAUSTED`                | High       |

Retry: `Retry-After` header + `Please retry in {N}s` in message + `RetryInfo` in body details. Free-tier `limit: 0` still returns 429.

### Overload / capacity

| Status | status enum          | Message                                                                                     | Confidence                                                                                                             |
| ------ | -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 503    | `UNAVAILABLE`        | `The model is overloaded. Please try again later.`                                          | High                                                                                                                   |
| 503    | `UNAVAILABLE`        | `This model is currently experiencing high demand. Spikes in demand are usually temporary…` | Medium — confirmed in production payloads; not in official tables                                                      |
| 503    | `UNAVAILABLE`        | Doc: _“temporarily running out of capacity”_                                                | High                                                                                                                   |
| 503    | `UNAVAILABLE`        | `No capacity available for model …` + `MODEL_CAPACITY_EXHAUSTED`                            | High — same reason code as 429 capacity ([gemini-cli#23520](https://github.com/google-gemini/gemini-cli/issues/23520)) |
| 500    | `INTERNAL`           | `Request is throttled, because the service is temporarily overloaded.`                      | High                                                                                                                   |
| 429    | `RESOURCE_EXHAUSTED` | Capacity also appears here (`No capacity available…` + `MODEL_CAPACITY_EXHAUSTED`)          | High                                                                                                                   |

Phrase inventory: `overloaded`, `high demand`, `temporarily overloaded`, `running out of capacity`, `throttled`, `no capacity available`.

**Classify overload message heuristics on 5xx only** — capacity on 429 stays `RateLimitError` (same HTTP bucket as quota).

### Service unavailable

| Status          | status enum   | Notes                             | Confidence                                                 |
| --------------- | ------------- | --------------------------------- | ---------------------------------------------------------- |
| 503             | `UNAVAILABLE` | Generic / no overload wording     | High                                                       |
| 500             | `INTERNAL`    | `An internal error has occurred…` | High — user payload; docs describe cause, not exact string |
| 502 / 504 / 408 | —             | Retryable per SDK                 | High                                                       |

### Other

| Status          | status                                     | Notes                        |
| --------------- | ------------------------------------------ | ---------------------------- |
| 400             | `INVALID_ARGUMENT` / `FAILED_PRECONDITION` | Malformed / billing / region |
| 401 / 403 / 404 | auth / permission / not found              | —                            |

## User-reported edge cases

1. 429 capacity vs 503 overload — same problem, different status; overload-only-on-503 misses `No capacity available…` on 429 (keep as RateLimitError). Same `MODEL_CAPACITY_EXHAUSTED` reason also appears on **503**.
2. Vertex 429 at low usage — consistent with shared capacity throttling; not a reproducible primary-doc payload.
3. 499 during peak ≠ client abort.
4. Historical 500 for context-too-long with generic message.
5. Wrong context limit in 400 message (routing quirk); empty token counts.
6. Streaming vs unary message shape differs (prefix vs bare JSON).
7. Double-wrapped JSON in proxies ([js-genai#1221](https://github.com/googleapis/js-genai/issues/1221)).
8. Free-tier `limit: 0` still 429.

## Recommended classification signals

1. **AbortedError** — `AbortError` / abort message wording only; **not** blanket 499
2. **ContextLengthExceededError** — token-count patterns / `exceeds the maximum number of tokens allowed` / alternate `Unable to submit request because the input token count is…`
3. **ModelOverloadedError** — overload phrases on **5xx only** (include `throttled` / `temporarily overloaded` for Vertex 500)
4. **RateLimitError** — HTTP 429 / `RESOURCE_EXHAUSTED` (includes capacity-on-429)
5. **ServiceUnavailableError** — `UNAVAILABLE` or remaining 5xx; consider ambiguous 499 here as retryable
6. **ProviderError** — else

**Parsing:** `ApiError.status` → `JSON.parse(message)` → `error.{code,status,message}`; strip streaming `got status: …` / `{code} {status}.` prefixes before parse. Prefer structured `ErrorInfo` reasons when present. Consider `RetryInfo.retryDelay` in addition to `Retry-After` header.

## Gaps vs current `wrapGoogleError`

| Gap                                                                                       | Status                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Alternate context template (`Unable to submit request because the input token count is…`) | **Open** — only `input token count ({N}) exceeds the maximum…` matched                                                                   |
| Streaming prefix stripping (`got status: …` / Python `{code} {status}.`)                  | **Open** — bare `JSON.parse(message)` fails on prefixed streaming format; message regex still works on full string                       |
| 499 server-side cancellation                                                              | **Partially closed** — does not map 499 → AbortedError (good); falls through to `ProviderError`, not retryable `ServiceUnavailableError` |
| 500 “temporarily overloaded” / `throttled`                                                | **Partially closed** — `\boverloaded\b` matches; **`throttled` not matched** → lands as `ServiceUnavailableError`                        |
| Capacity phrases on 5xx (`running out of capacity`, `no capacity available`, …)           | **Open** — wrapper only checks `\boverloaded\b` and `\bhigh demand\b`                                                                    |
| `RetryInfo` / message `Please retry in Ns`                                                | **Open** — only `Retry-After` header parsed                                                                                              |
| Capacity on 429                                                                           | **Correct** — stays `RateLimitError`; overload heuristics exclude 429                                                                    |
| Empty-paren context template                                                              | **Partially covered** — fallback `/exceeds the maximum number of tokens allowed/` catches wording without counts                         |

## Sources

- https://ai.google.dev/gemini-api/docs/troubleshooting
- https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/api-errors
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/error-code-429
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/retry-strategy
- https://github.com/googleapis/js-genai/blob/main/src/errors.ts
- https://github.com/googleapis/js-genai/blob/main/src/_api_client.ts
- https://discuss.ai.google.dev/t/handling-429-503-errors-from-the-gemini-api/124640/6
- https://discuss.ai.google.dev/t/unreliable-api-requests-for-gemini-2-5-pro-and-gemini-3-0-preview/112384
- https://discuss.ai.google.dev/t/503-this-model-is-currently-experiencing-high-demand-spikes-in-demand-are-usually-temporary-please-try-again-later/138664
- https://github.com/google-gemini/gemini-cli/issues/10393
- https://github.com/google-gemini/gemini-cli/issues/23520
- https://github.com/googleapis/python-genai/issues/2506
