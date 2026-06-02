# @core-ai/omnifact

[![npm](https://img.shields.io/npm/v/@core-ai/omnifact.svg)](https://www.npmjs.com/package/@core-ai/omnifact)

Omnifact provider package for `@core-ai/core-ai`. Connects to the Omnifact API Gateway, an OpenAI-compatible endpoint for chat completions.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/omnifact zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createOmnifact } from '@core-ai/omnifact';

const omnifact = createOmnifact({
    apiKey: process.env.OMNIFACT_API_KEY,
});

// Use an id from GET /v1/gateway/models (eu/ prefix for EU-hosted models).
const model = omnifact.chatModel('eu/gpt-5-mini');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

By default, requests go to `https://connect.omnifact.ai/v1/gateway`. Set `baseURL` to use a custom gateway URL.

Use your Omnifact organization API key as the `apiKey`.

## Model IDs

Pass the exact `id` from `GET /v1/gateway/models`. EU-hosted models (Azure, Vertex, Mistral, etc.) use the `eu/` prefix, for example `eu/gpt-5-mini`. Direct non-EU providers use the plain type id, for example `gpt-5-mini`.
