---
'@core-ai/google-genai': patch
---

Add model capability support for `gemini-4-neon-cyber-permissive` (Gemini 4 Neon for cyber), an allowlisted Vertex variant of `gemini-4-neon` for defensive cybersecurity work. It uses the `gemini-4-neon` profile: thinking is always on with levels `low`, `medium`, `high`, and `xhigh`; the `max` effort maps to `xhigh`, and other efforts clamp to the nearest level. `temperature`, `topP`, `topK`, `frequencyPenalty`, and `presencePenalty` throw `ValidationError`. Function calling and structured outputs are supported. The synchronous output ceiling is 65,536 tokens.
