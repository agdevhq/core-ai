---
'@core-ai/core-ai': minor
'@core-ai/google-genai': minor
---

Clarify embedding usage semantics by making `EmbedResult.usage` optional in the
core API contract, so providers can return `usage: undefined` when token counts
are not exposed by the underlying API.

Update Google GenAI embedding behavior to only include usage when token
statistics are present, and add provider E2E contract coverage for cross-
provider live validation.
