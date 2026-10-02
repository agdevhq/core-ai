---
'@core-ai/google-genai': minor
---

Use each Gemini 2.5 model's documented thinking budget range.

- `max` maps to the model's documented maximum (32,768 on Pro, 24,576 on Flash
  and Flash-Lite) and `high` to 75% of it, so Flash no longer receives an
  out-of-range budget and `high` differs from `max`.
- **Breaking:** an explicit `maxTokens` at or below the Gemini 2.5 thinking
  budget throws `ValidationError` instead of returning an empty answer.
- Capabilities report `output.maxTokens` (65,536) for known Gemini 2.5 and 3
  models and `reasoning.thinkingBudgetRange` for Gemini 2.5.
