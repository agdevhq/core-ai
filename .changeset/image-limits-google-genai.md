---
'@core-ai/google-genai': minor
---

Report the per-request image limit of known Gemini models in `capabilities.input` (3,600 on the Gemini API). `getGoogleModelCapabilities` takes an optional `platform` (`'gemini-api'` or `'vertex'`), and `createGoogleGenAIProvider` a matching `platform` factory option. Unknown model ids report no limit.
