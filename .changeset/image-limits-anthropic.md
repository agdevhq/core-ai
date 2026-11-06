---
'@core-ai/anthropic': minor
'@core-ai/anthropic-vertex': minor
---

Report the per-request limit Claude models share between images and PDF pages in `capabilities.input`: 600 for models with a 1M-token context window, 100 for 200k models. Unknown model ids report no limit.
