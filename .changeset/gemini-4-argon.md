---
'@core-ai/google-genai': minor
---

Add model capability support for `gemini-4-argon`. Thinking is always on and uses levels `low`, `medium`, and `high`; other efforts clamp to the nearest level. `temperature`, `topP`, `topK`, `frequencyPenalty`, and `presencePenalty` throw `ValidationError`: the model ignores the first three and rejects the penalties. The synchronous output ceiling is 65,536 tokens.
