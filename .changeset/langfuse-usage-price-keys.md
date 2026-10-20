---
'@core-ai/langfuse': minor
---

Report chat usage under the key names Langfuse's managed model prices use, so cached input and reasoning output are no longer priced at $0. Cache tokens are now reported as `input_cache_read` and `input_cache_creation` (previously `cache_read_input` and `cache_creation_input`). `output` now includes reasoning tokens and the `reasoning_output` key is removed; the reasoning token count is recorded as `reasoningTokens` in the observation metadata instead.
