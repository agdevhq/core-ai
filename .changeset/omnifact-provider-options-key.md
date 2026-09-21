---
'@core-ai/omnifact': minor
---

**Breaking:** provider options are now read from `providerOptions.omnifact`. Options under `providerOptions.openai` are silently ignored for Omnifact models — move them to the `omnifact` key. The accepted fields are unchanged and typed via the new `OmnifactGenerateProviderOptions` export.
