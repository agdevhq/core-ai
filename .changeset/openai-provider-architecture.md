---
'@core-ai/openai': minor
'@core-ai/openai-compat': minor
'@core-ai/azure-openai': minor
'@core-ai/omnifact': patch
---

Expose strict Chat Completions as `openai.chat.chatModel()` while keeping the Responses API at the root, add a standalone compatibility-enabled Chat Completions provider, and add Responses API support to Azure OpenAI v1. Omnifact now reuses the compatibility layer for nonstandard reasoning output.
