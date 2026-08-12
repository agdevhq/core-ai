---
'@core-ai/core-ai': minor
---

Add `providerMetadata` to `ToolCallPart` and the `tool-call-end` stream event so provider-owned data attached to a tool call, such as a Google thought signature, survives aggregation and can be replayed with the call.
