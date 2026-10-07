---
'@core-ai/google-genai': minor
---

**Breaking:** chat, embedding, and image models now read `providerOptions` from the key matching the model's provider id (`model.provider`) instead of always reading `providerOptions.google`. Models from `createGoogleGenAI()` are unaffected; providers built on `createGoogleGenAIProvider()` with a custom `providerId` now read options only from their own key and ignore `google`.
