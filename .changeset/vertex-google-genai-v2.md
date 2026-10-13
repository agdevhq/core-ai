---
'@core-ai/google-vertex': minor
---

Upgrade `@google/genai` to 2.x. Vertex locations `us` and `eu` now route to their multi-region hosts (`https://aiplatform.us.rep.googleapis.com/` and `https://aiplatform.eu.rep.googleapis.com/`), which serve `gemini-4-argon`. A `client` passed to `createGoogleVertex` must come from `@google/genai` 2.x.
