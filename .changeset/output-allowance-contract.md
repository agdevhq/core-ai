---
'@core-ai/core-ai': minor
---

Define `maxTokens` as the total output allowance, covering reasoning tokens and
the visible answer. An omitted `maxTokens` means the model's output ceiling,
and adapters reject an explicit limit that cannot hold the reasoning budget of
the requested effort instead of shrinking the budget.

Add optional `ModelCapabilities.output.maxTokens`, the verified output ceiling
for a model id. It is absent when the ceiling is unknown.
