---
'@core-ai/mistral': minor
---

Add Mistral Small 4, Medium 3.5, and Large 4, and Z.ai GLM 5.3 hosted on the Mistral API. These models accept adjustable reasoning: `reasoning.effort` is sent as `reasoning_effort` (`none` or `high` for the Mistral models; `low`, `high`, or `max` for GLM). Older pinned ids and Magistral models still omit the parameter.
