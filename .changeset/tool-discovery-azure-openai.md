---
'@core-ai/azure-openai': minor
---

Support tool discovery natively on the v1 (Responses) API from GPT-5.4 on (except `gpt-5.4-nano` and `gpt-5.5-pro`), with a client-executed `tool_search` tool that keeps the prompt cache intact. The `emulateToolDiscovery` provider option under the `azure-openai` key forces emulation. The Chat Completions and classic APIs emulate discovery with ordinary function tools.
