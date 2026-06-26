---
'@core-ai/core-ai': patch
'@core-ai/openai': patch
'@core-ai/anthropic': patch
'@core-ai/google-genai': patch
'@core-ai/mistral': patch
'@core-ai/omnifact': patch
'@core-ai/azure-openai': patch
'@core-ai/opentelemetry': patch
'@core-ai/langfuse': patch
---

Add `require` and `default` export conditions so packages resolve under CommonJS loaders such as tsx.
