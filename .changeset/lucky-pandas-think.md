---
'@core-ai/anthropic': patch
---

Resolve reasoning budgets and output limits together instead of silently
shrinking the thinking budget to fit `maxTokens`.

- An omitted `maxTokens` is now sized from the requested effort: the thinking
  budget plus `defaultMaxTokens`, capped at the model's output ceiling. Adaptive
  `max` effort gets the model's full output range, so a small default allowance
  no longer caps the deepest reasoning. Large `generate()` requests use
  streaming internally and still return a regular result.
- An explicit `maxTokens` stays a hard limit and raises `ValidationError` when it
  cannot hold the requested thinking budget outside interleaved thinking,
  rather than quietly degrading the request.
- Interleaved thinking keeps the per-response `maxTokens` allowance and permits
  its cumulative thinking budget to exceed that limit, as supported by
  Anthropic.
- Model capabilities report verified `output.maxTokens` for known Claude models.
