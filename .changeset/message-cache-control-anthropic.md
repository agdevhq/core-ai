---
'@core-ai/anthropic': minor
---

User and tool result messages accept `providerOptions.anthropic.cacheControl` for explicit cache breakpoints with their own TTL. The breakpoint goes on the last content block the message produces: a string user message is sent as one text block, a user message with parts marks its last part, and a tool result marks its `tool_result` block, including when consecutive tool results share one user turn. These breakpoints count toward the 4-breakpoint limit and the TTL ordering checks, and request-level `cacheControl` must match the TTL of a breakpoint on the last message. A user message with `cacheControl` but no non-whitespace text or content parts throws `ValidationError`.
