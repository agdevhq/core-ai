---
'@core-ai/anthropic': patch
---

Size adaptive `max` effort from the model's output ceiling and stream large
`generate()` requests internally so a small default `maxTokens` no longer caps
the deepest reasoning. Manual thinking on Claude 4.5 and earlier still clamps
the budget to fit the caller limit. Model capabilities report verified
`output.maxTokens` for known Claude models.
