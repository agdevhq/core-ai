---
'@core-ai/anthropic': patch
---

Finish with `'tool-calls'` when a response completes tool calls but Claude stops with `end_turn` or `stop_sequence`, as the other providers do. Truncated tool calls keep their `'length'` finish.
