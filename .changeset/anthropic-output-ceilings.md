---
'@core-ai/anthropic': minor
---

Size omitted output limits from the model and stream every request.

- **Breaking:** an omitted `maxTokens` now uses `defaultMaxTokens` if you set
  it, otherwise the model's output ceiling (128,000 on Opus/Sonnet 4.6 and
  later, Fable, and Mythos; 64,000 on Claude 4.5), and 4,096 only for model ids
  without a known ceiling. `defaultMaxTokens` no longer defaults to 4,096.
- **Breaking:** manual thinking budgets (Claude 4.5 and earlier) are no longer
  shrunk to fit `maxTokens`. A limit at or below the budget throws
  `ValidationError`. The `high` and `max` budgets are now 50% and 75% of the
  model's output ceiling (32,000 and 48,000 on Claude 4.5), so every budget
  fits an omitted `maxTokens`.
- `generate()` and `generateObject()` stream internally and return the same
  result. Mid-stream errors such as `overloaded_error` surface as
  `ModelOverloadedError`, and aborts as `AbortedError`.
- Redacted thinking blocks are kept in streamed results.
- A response cut off at the context window (`model_context_window_exceeded`)
  now reports `finishReason: 'length'` instead of `'unknown'`.
- Capabilities report `output.maxTokens` for known Claude models.
