---
'@core-ai/mistral': patch
---

Map Mistral `service tier capacity exceeded` errors to `ModelOverloadedError` on 5xx and in-band (no HTTP status), aligning backend-capacity errors with Azure `NoCapacity` and Anthropic `overloaded_error`. Previously they landed on `ServiceUnavailableError`.
