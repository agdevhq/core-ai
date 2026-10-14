---
'@core-ai/anthropic': minor
---

Strict tool and structured output schemas keep properties named like JSON Schema keywords, such as `minimum` or `maxLength`, which were dropped before. Record value schemas (`additionalProperties`) are sent as declared instead of being closed to an empty object. Unsupported constraints are still dropped where they are schema keywords.
