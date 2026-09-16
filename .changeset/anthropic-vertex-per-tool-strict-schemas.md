---
'@core-ai/anthropic-vertex': minor
---

**Breaking:** the `useStrictToolSchemas` option was removed without a replacement. Strict tool schemas are now per-tool opt-in (`defineTool({ strict: true })`) and follow the model's capabilities. Note that Vertex AI only accepts strict tools when the GCP organization policy `constraints/vertexai.allowedPartnerModelFeatures` allows the `structured_outputs` feature — without it, Vertex rejects the request with an org-policy violation error.
