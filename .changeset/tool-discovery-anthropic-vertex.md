---
'@core-ai/anthropic-vertex': minor
---

Support tool discovery natively on Claude 4.5 models and later: discovered tools are declared with `defer_loading` and loaded by `tool_reference` blocks, which keeps the prompt cache intact. Older models emulate discovery with ordinary tools. The `emulateToolDiscovery` provider option under the `anthropic-vertex` key forces emulation.
