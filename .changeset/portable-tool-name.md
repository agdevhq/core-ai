---
'@core-ai/core-ai': minor
---

Add `toPortableToolName()`, which returns a tool name every provider accepts: valid names unchanged, any other name with invalid characters replaced, a leading `_` where needed, and a stable hash of the original name appended, within 128 characters. Use it for names you do not control, such as MCP tool names, and map tool calls back to the original name.
