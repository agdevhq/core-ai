---
'@core-ai/openai': patch
---

`createOpenAI()` chat models for fine-tuned ids (`ft:<base-model>:…`) now report the base model's capabilities, matching `getOpenAIModelCapabilities()`. They previously fell back to the unknown-model defaults.
