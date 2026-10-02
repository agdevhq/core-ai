---
'@core-ai/google-vertex': minor
---

Re-export `GoogleThinkingBudgetRange`. Vertex-hosted Gemini 2.5 models use
their documented thinking budget ranges, and an explicit `maxTokens` at or
below the thinking budget throws `ValidationError`.
