---
'@core-ai/google-genai': patch
---

Add model capability support for `gemini-4-carbon`. Thinking is always on and uses levels `low`, `medium`, and `high`; other efforts clamp to the nearest level. `temperature`, `topP`, `topK`, `frequencyPenalty`, and `presencePenalty` throw `ValidationError`, as on `gemini-4-argon`. The synchronous output ceiling is 65,536 tokens.
