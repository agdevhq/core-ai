---
'@core-ai/anthropic': patch
---

Resolve reasoning budgets and output limits together instead of silently
shrinking the thinking budget to fit `maxTokens`.

- An omitted `maxTokens` is now sized from the requested effort: the thinking
  budget plus `defaultMaxTokens`, capped at the model's output ceiling. Adaptive
  `max` effort gets the model's full output range, so a small default allowance
  no longer caps the deepest reasoning.
- An explicit `maxTokens` stays a hard limit and raises `ValidationError` when it
  cannot hold the requested thinking budget, rather than quietly degrading the
  request.
- `supportedEfforts` now omits manual-thinking efforts whose budget cannot fit
  under the model's output ceiling, so a too-high effort clamps down instead of
  producing a request the API rejects.
- Model capabilities report verified `output.maxTokens` for known Claude models.
