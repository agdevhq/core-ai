---
'@core-ai/openai': minor
---

Wrap in-band stream errors as typed provider errors and expose the OpenAI error `code` (including `insufficient_quota` and `credit_balance_exhausted`) on the thrown instance.
