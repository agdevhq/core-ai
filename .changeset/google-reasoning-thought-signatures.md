---
'@core-ai/google-genai': patch
---

Round-trip Gemini thought signatures on reasoning parts for generate and stream: attach trailing empty-thought signatures to the prior reasoning part, and emit them on streamed `reasoning-end` while the block is open.
