---
'@core-ai/google-vertex': minor
---

**Breaking:** models report `systemPlacement: 'leading'`, and a system message after the first non-system message now throws `UnsupportedSystemMessagePlacementError` instead of being merged into `systemInstruction`.
