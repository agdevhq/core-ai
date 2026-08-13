---
'@core-ai/openai-compat': minor
---

Forward per-tool `strict: true` optimistically with normalized schemas. The `strictToolSchemas` opt-in option was removed — capabilities report strict schemas as supported, and endpoints that lack the feature surface their own error.
