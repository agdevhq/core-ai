---
'@core-ai/core-ai': patch
---

Add optional `output.maxTokens` to `ModelCapabilities` so providers can publish
a model's verified output ceiling. Adapters use it to size requests that spend
reasoning tokens out of the output allowance, and callers can read it instead of
hardcoding per-model token limits. The field is absent when a provider has no
verified value for a model id.
