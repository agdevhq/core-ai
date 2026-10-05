---
'@core-ai/google-genai': patch
---

Gemini 3 models now report only the `low` and `high` reasoning efforts in `capabilities.reasoning.supportedEfforts`, matching the two thinking levels they can tell apart. Requests are unchanged: other efforts still map onto those two levels.
