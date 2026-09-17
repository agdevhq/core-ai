---
'@core-ai/anthropic': patch
---

Size adaptive `max` effort from the model's output ceiling and stream
`generate()` / `generateObject()` requests above 8,192 tokens internally so a
small default `maxTokens` no longer caps the deepest reasoning. Any larger
limit uses the streaming transport and still returns a regular result. Manual
thinking on Claude 4.5 and earlier still clamps the budget to fit the caller
limit. Model capabilities report verified `output.maxTokens` for known Claude
models.
