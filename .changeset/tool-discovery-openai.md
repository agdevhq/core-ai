---
'@core-ai/openai': minor
---

Support tool discovery natively on the Responses API from GPT-5.4 on (except `gpt-5.4-nano` and `gpt-5.5-pro`), with a client-executed `tool_search` tool: discovered tools are delivered as deferred functions in `tool_search_output` items, which keeps the prompt cache intact, and replayed calls to them carry their `namespace`. The `note` of an empty result follows the step's tool outputs as a developer message. Other models and the Chat Completions API emulate discovery with ordinary function tools. The `emulateToolDiscovery` Responses provider option forces emulation.
