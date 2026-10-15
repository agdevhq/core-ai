---
'@core-ai/google-genai': patch
---

Function calls that Gemini returns without an id get a generated, unique id. Parallel calls, calls streamed in separate chunks, and calls of later responses shared fallback ids before, so a call could be dropped or its result paired with the wrong call.
