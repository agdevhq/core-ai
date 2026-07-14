---
'@core-ai/openai': patch
---

Extract nonstandard reasoning fields from OpenAI-compatible endpoints in the compat adapter. Streamed `reasoning_content` / `reasoning` deltas (DeepSeek, Qwen, GLM, vLLM, OpenRouter) now emit `reasoning-start` / `reasoning-delta` / `reasoning-end` events, and non-streaming responses map them to a reasoning part and `result.reasoning`. Previously these tokens were silently dropped, so reasoning models that spent the whole token budget thinking produced streams with no events at all.
