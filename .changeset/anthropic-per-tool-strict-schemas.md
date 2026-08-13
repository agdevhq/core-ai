---
'@core-ai/anthropic': minor
---

Strict tool schemas are now per-tool opt-in: only tools defined with `strict: true` are sent strict. **Behavior change:** previous releases applied `strict: true` to every tool on every model — tools that do not opt in are no longer strict; set `strict: true` per tool to restore enforcement. The 20-strict-tool limit now counts only opted-in tools, models before Claude 4.5 report strict schemas as unsupported, and unknown/future model ids resolve optimistically to supported. The internal `strictToolSchemasEnabled` factory option was removed.
