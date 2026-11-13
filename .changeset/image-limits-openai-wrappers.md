---
'@core-ai/azure-openai': patch
'@core-ai/openai-compat': patch
'@core-ai/omnifact': patch
---

Chat models do not report OpenAI's image limit in `capabilities.input`, since this host enforces its own.
