---
'@core-ai/google-genai': minor
---

Add model capability support for `gemini-4-argon`. Thinking is always on and uses levels `low`, `medium`, and `high`; other efforts clamp to the nearest level. `temperature`, `topP`, and `topK` throw `ValidationError` because the model ignores them. The synchronous output ceiling is 65,536 tokens.
