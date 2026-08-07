---
'@core-ai/anthropic': minor
---

Report chat modalities in model capabilities. Every Claude model reports `modalities.input: ['text', 'image', 'file']` and `modalities.output: ['text']`, and the adapter validates image parts against the capability before calling the API. File parts remain PDF-only at the adapter layer.
