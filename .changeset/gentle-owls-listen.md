---
'@core-ai/google-genai': patch
---

Align the Gemini 3 capability table with the model ids Google serves. Add `gemini-3-flash-preview` with its four thinking levels; it previously fell back to the Gemini 2.5-style thinking-budget defaults. Remove `gemini-3-pro`, `gemini-3.1-pro` and `gemini-3.1-flash-lite-preview`, which are shut down or never existed under those ids, and update the docs and README examples to ids that resolve.
