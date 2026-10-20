---
'@core-ai/core-ai': minor
---

Add `toPortableToolName()`, which returns a tool name every provider accepts: valid names unchanged, any other name with invalid characters replaced by `_`, a leading `_` where needed, and at most 128 characters. Use it for names you do not control, such as MCP tool names, check that the converted names stay unique, and map tool calls back to the original name.
