---
'@core-ai/openai': minor
---

**Breaking:** `gpt-6-sol` and `gpt-6-luna` report Chat Completions function calling as `supported`, matching GPT-5.6. Tool requests are forwarded as given. Omitting `reasoning` no longer sets `reasoning_effort` to `none`, and combining tools with `reasoning` is no longer rejected.
