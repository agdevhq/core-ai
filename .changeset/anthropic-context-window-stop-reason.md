---
'@core-ai/anthropic': patch
---

Report a response cut off at the context window as truncated.

- A response that stops with `model_context_window_exceeded` now reports
  `finishReason: 'length'` instead of `'unknown'`.
- Upgrade `@anthropic-ai/sdk` to `^0.114.0`, the first version whose
  `StopReason` type includes that value.
