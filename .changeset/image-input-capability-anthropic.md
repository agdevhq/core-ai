---
'@core-ai/anthropic': minor
---

Report image input support in model capabilities. Every Claude model reports `modalities.imageInput: true`, and the adapter validates image parts against the capability before calling the API.
