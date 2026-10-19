---
'@core-ai/openai': patch
---

Chat Completions streams start a tool call once its name is known, with the arguments received so far, and keep its id fixed from then on. Servers that send the name after the first chunk no longer produce a nameless `tool-call-start`, so a discovery call streams as a single `tool-discovery-call` event there too.
