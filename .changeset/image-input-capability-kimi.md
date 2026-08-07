---
'@core-ai/kimi': minor
---

Report chat modalities in model capabilities. The K2.7 Code models are text-only (`modalities.input: ['text']`), so image parts are rejected before the request is sent; unknown model IDs stay multimodal capable (`['text', 'image', 'file']`). `modalities.output` is `['text']`.
