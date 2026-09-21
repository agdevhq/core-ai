---
'@core-ai/azure-openai': minor
---

**Breaking:** provider options are now read from `providerOptions['azure-openai']` on every API (v1 Responses, v1 Chat Completions, and classic). Options under `providerOptions.openai` are silently ignored for Azure OpenAI models — move them to the `azure-openai` key. The accepted fields are unchanged and typed via the new `AzureOpenAIResponsesGenerateProviderOptions` and `AzureOpenAIChatGenerateProviderOptions` exports.
