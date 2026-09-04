---
'@core-ai/mistral': patch
---

Map in-band Mistral `service tier capacity exceeded` errors to `ServiceUnavailableError` when no HTTP status is present.
