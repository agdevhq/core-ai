---
'@core-ai/google-genai': patch
---

Use each Gemini 3 model's own thinking levels. `capabilities.reasoning.supportedEfforts` now lists the efforts a model has a level for, and a supported effort is sent as that level: `medium` sends `MEDIUM` and `minimal` sends `MINIMAL` where the model accepts them, instead of both collapsing to `LOW`. Efforts without a level are clamped to the nearest one, so `max` still resolves to `HIGH`.
