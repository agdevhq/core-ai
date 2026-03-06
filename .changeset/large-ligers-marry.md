---
'@core-ai/google-genai': patch
'@core-ai/openai': patch
---

Refactor chat adapter internals to remove dead branches, reduce duplicated request assembly logic, and simplify reasoning stream handling without changing behavior.
