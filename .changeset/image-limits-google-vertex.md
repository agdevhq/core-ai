---
'@core-ai/google-vertex': minor
---

Report Vertex AI's per-request image limit of known Gemini models in `capabilities.input` (3,000). `getGoogleModelCapabilities` from this package now returns Vertex AI's limits, matching `chatModel(modelId).capabilities`.
