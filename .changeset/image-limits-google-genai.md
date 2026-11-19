---
'@core-ai/google-genai': minor
---

Report the per-request image limit of known Gemini models in `capabilities.input` (3,600 on the Gemini API, 3,000 on Vertex AI). The limit follows the client's target, so a `GoogleGenAI` client created with `vertexai: true` reports Vertex AI's limit. `getGoogleModelCapabilities` takes an optional `platform` (`'gemini-api'` or `'vertex'`), and `createGoogleGenAIProvider` a matching `platform` factory option that overrides the detected one. Unknown model ids report no limit.
