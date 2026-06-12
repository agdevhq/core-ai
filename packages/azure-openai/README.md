# @core-ai/azure-openai

[![npm](https://img.shields.io/npm/v/@core-ai/azure-openai.svg)](https://www.npmjs.com/package/@core-ai/azure-openai)

Azure OpenAI provider package for `@core-ai/core-ai`. It uses the Azure OpenAI v1 Chat Completions API by default and can opt into the classic API.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/azure-openai zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createAzureOpenAI } from '@core-ai/azure-openai';

const azure = createAzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
});

// Use your Azure OpenAI deployment name as the model id.
const model = azure.chatModel('gpt-5-mini-deployment');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

## Authentication

Use an Azure OpenAI API key with the v1 API:

```ts
const azure = createAzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
});
```

Set `api: 'classic'` to use the classic Azure API surface:

```ts
const azure = createAzureOpenAI({
    api: 'classic',
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2025-04-01-preview',
});
```

Classic mode also accepts an Entra ID token provider via `azureADTokenProvider`.

## Model IDs

Pass your Azure OpenAI deployment name to `chatModel()`. The provider sends it as the Chat Completions `model` field.

```ts
const model = azure.chatModel('customer-support-gpt-5-mini');
```

This package supports chat models only. Use `@core-ai/openai` for OpenAI Responses API, embeddings, and image generation.
