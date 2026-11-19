---
'@core-ai/google-genai': patch
---

Add model capability support for `gemini-4-neon`. Thinking is always on and uses levels `low`, `medium`, `high`, and `xhigh`; the `max` effort maps to `xhigh`, and other efforts clamp to the nearest level. `temperature`, `topP`, `topK`, `frequencyPenalty`, and `presencePenalty` throw `ValidationError`, as on `gemini-4-hydrogen`. Function calling and structured outputs are supported. The synchronous output ceiling is 65,536 tokens.
