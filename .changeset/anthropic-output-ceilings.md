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
  `ValidationError`. The `max` budget is now 48,000 so it fits the 64,000
  ceiling.
- `generate()` and `generateObject()` stream internally and return the same
  result. Mid-stream errors such as `overloaded_error` surface as
  `ModelOverloadedError`, and aborts as `AbortedError`.
- Redacted thinking blocks are kept in streamed results.
- Capabilities report `output.maxTokens` for known Claude models.
