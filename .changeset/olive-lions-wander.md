---
'@core-ai/google-genai': minor
---

Derive Gemini 2.5 thinking budgets from each model's documented range instead of
one global maximum, and coordinate them with the output limit.

- `max` effort now maps to the model's actual maximum budget (32,768 on Pro,
  24,576 on Flash and Flash-Lite) and is distinct from `high`, which no longer
  exceeds the Flash range.
- On Gemini 2.5, an omitted `maxTokens` with `reasoning` set uses the model's
  verified 65,536 output limit. Gemini 3 does not auto-set that limit.
- Breaking: an explicit `maxTokens` that cannot hold the Gemini 2.5 thinking
  budget now raises `ValidationError` instead of returning an empty answer.
  `maxTokens: 32768` with Pro `effort: 'max'` is rejected.
- Requested efforts are clamped against the model's declared efforts before
  mapping, and capabilities expose `output.maxTokens` plus
  `reasoning.thinkingBudgetRange` for Gemini 2.5.
