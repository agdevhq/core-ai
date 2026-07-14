---
'@core-ai/openai': minor
---

Root `createOpenAI()` uses the Responses API by default. Strict Chat Completions are available at `openai.chat.chatModel()`. Object generation prefers native strict JSON Schema output. The shared provider factory now exposes compatibility options for reasoning extraction and structured output transport.
