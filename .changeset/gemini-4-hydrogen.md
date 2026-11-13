---
'@core-ai/google-genai': minor
---

Add model capability support for `gemini-4-hydrogen`. Thinking is always on and uses levels `low`, `medium`, `high`, and `xhigh`; the `max` effort maps to `xhigh`, and other efforts clamp to the nearest level. `temperature`, `topP`, `topK`, `frequencyPenalty`, and `presencePenalty` throw `ValidationError`, as on `gemini-4-argon`. The synchronous output ceiling is 65,536 tokens.
