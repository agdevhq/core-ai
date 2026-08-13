---
'@core-ai/google-genai': patch
'@core-ai/google-vertex': patch
'@core-ai/mistral': patch
---

Report per-tool strict schemas as unsupported in model capabilities; a tool with `strict: true` throws `ToolSchemaStrictnessError` before any provider I/O.
