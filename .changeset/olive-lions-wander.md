---
'@core-ai/google-genai': patch
---

Derive Gemini 2.5 thinking budgets from each model's documented range instead of
one global maximum, and coordinate them with the output limit.

- `max` effort now maps to the model's actual maximum budget (32,768 on Pro,
  24,576 on Flash and Flash-Lite) and is distinct from `high`, which no longer
  exceeds the Flash range.
- An omitted `maxTokens` sets the model's verified output limit so thoughts and
  visible answer both have room; an explicit `maxTokens` that cannot hold the
  thinking budget raises `ValidationError` instead of returning an empty answer.
- Requested efforts are clamped against the model's declared efforts before
  mapping, and capabilities expose `output.maxTokens` plus
  `reasoning.thinkingBudgetRange`.
