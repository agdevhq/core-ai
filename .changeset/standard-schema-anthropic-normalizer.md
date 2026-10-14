---
'@core-ai/anthropic': minor
---

Strict tool and structured output schemas keep properties named like JSON Schema keywords, such as `minimum` or `maxLength`, which were dropped before. **Breaking:** record value schemas (`additionalProperties` with a schema, e.g. `z.record()`) are sent as declared instead of being silently closed, which limited the model to an empty record. Anthropic rejects them with a 400, so model key/value data as an array of objects instead. Unsupported constraints are still dropped where they are schema keywords. Strict tools accept optional keys that accept `null` or declare a `default` and send them as required, which keeps them clear of Anthropic's limit of 24 optional parameters.
