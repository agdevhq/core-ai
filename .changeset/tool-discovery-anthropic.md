---
'@core-ai/anthropic': minor
---

Support tool discovery natively on Claude 4.5 models and later: discovered tools are declared with `defer_loading` and loaded by `tool_reference` blocks, which keeps the prompt cache intact, and a never-referenced deferred placeholder keeps deferred loading active for the whole conversation. Older models emulate discovery with ordinary tools. The `emulateToolDiscovery` provider option forces emulation.
