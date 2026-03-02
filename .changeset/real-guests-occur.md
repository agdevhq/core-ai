---
'@core-ai/core-ai': patch
'@core-ai/openai': patch
'@core-ai/anthropic': patch
'@core-ai/google-genai': patch
'@core-ai/mistral': patch
---
Fix release publish race: remove prepublishOnly to avoid concurrent tsup builds failing to resolve @core-ai/core-ai.
