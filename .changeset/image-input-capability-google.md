---
'@core-ai/google-genai': minor
---

Report chat modalities in model capabilities. Every Gemini chat model reports `modalities.input: ['text', 'image', 'file']` and `modalities.output: ['text']`, and the adapter validates image parts against the capability before calling the API. Audio and video are not advertised until dedicated user content parts exist.
