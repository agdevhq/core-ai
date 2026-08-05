---
'@core-ai/anthropic': minor
---

Report image input support in model capabilities. Every Claude model accepts `base64` and `url` image sources, and the adapter validates image parts against the capability before calling the API.
