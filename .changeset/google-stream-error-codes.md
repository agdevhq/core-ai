---
'@core-ai/google-genai': patch
---

Wrap in-band stream errors as typed provider errors and expose Google's gRPC status (e.g. `RESOURCE_EXHAUSTED`) as `ProviderError.code`.
