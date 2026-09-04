---
'@core-ai/openai': patch
---

Map in-band Azure `no_capacity` stream errors to `ModelOverloadedError`, matching HTTP 429 `NoCapacity`.
