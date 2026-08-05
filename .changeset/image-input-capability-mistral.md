---
'@core-ai/mistral': minor
---

Resolve capabilities per model instead of returning one shared value. Vision families (`mistral-large`, `mistral-medium`, `mistral-small`, `magistral-*`, `ministral-*`, `pixtral-*`) report image input as supported, while text-only families (`codestral`, `devstral-*`, `open-mistral-*`, `open-mixtral-*`) reject images before the request is sent. Unknown model IDs stay image capable.

Lookup prefers an exact model ID and falls back to the family with the `-latest` alias and `-YYMM` version suffix removed. Mistral added vision to each family at a specific release, so pinned versions from before that release are reported as text-only: Mistral Large before `-2512`, Mistral Small before `-2503`, Magistral before `-2509`, and Ministral before `-2512`.
