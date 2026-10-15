---
'@core-ai/openai': patch
---

Chat Completions responses that call tools finish with `'tool-calls'` when the API reports `stop`, as OpenAI does when `toolChoice` names a tool and some OpenAI-compatible servers do for every tool call. Streams now emit those calls' `tool-call-end` events instead of dropping them, and tool-based `generateObject` / `streamObject` report `'tool-calls'`.
