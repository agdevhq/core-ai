---
'@core-ai/openai': minor
---

Support tool discovery natively on the Responses API from GPT-5.4 on (except `gpt-5.4-nano` and `gpt-5.5-pro`), with a client-executed `tool_search` tool: discovered tools are delivered as deferred functions in `tool_search_output` items, each output as stored, so discoveries and refreshed definitions keep the prompt cache intact (unless a refresh changes whether a name is strict, which re-renders its earlier outputs) and the model uses the newest definition of a name, and replayed calls to them carry their `namespace`. The `note` of an empty result follows the step's tool outputs as a developer message. Other models and the Chat Completions API emulate discovery with ordinary function tools. The `emulateToolDiscovery` Responses provider option forces emulation.
