# @core-ai/xai

[![npm](https://img.shields.io/npm/v/@core-ai/xai.svg)](https://www.npmjs.com/package/@core-ai/xai)

xAI provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/xai zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createXAI } from '@core-ai/xai';

const xai = createXAI({
    apiKey: process.env.XAI_API_KEY,
});

const model = xai.chatModel('grok-4.3');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Explain quantum computing briefly.' }],
});

console.log(result.content);
```

By default, requests go to `https://api.x.ai/v1`. Set `baseURL` to use a custom endpoint.

## Supported models

- `grok-4.3` — flagship Grok model with configurable reasoning effort
- `grok-4.20-0309-reasoning` — reasoning-focused Grok 4.20 variant
- `grok-4.20-0309-non-reasoning` — lower-latency Grok 4.20 variant
- `grok-build-0.1` — coding-focused agentic model

## Reasoning

For `grok-4.3`, pass `reasoning: { effort: 'low' | 'medium' | 'high' }` to control thinking depth. Use `minimal` to disable reasoning (`reasoning_effort: none`). The provider maps xAI's `reasoning_content` field to core-ai reasoning parts and preserves it across multi-turn conversations via `resultToMessage()`.

## Structured output

`generateObject()` and `streamObject()` use xAI JSON Mode (`response_format: { type: 'json_object' }`) and validate the returned JSON with your Zod schema.

## Provider options

Pass xAI-specific options via `providerOptions.xai`:

```ts
await generate({
    model,
    messages: [{ role: 'user', content: 'Hello' }],
    providerOptions: {
        xai: {
            parallelToolCalls: true,
            responseFormat: { type: 'json_object' },
            serviceTier: 'priority',
        },
    },
});
```

Reasoning models do not support `stopSequences`, `frequencyPenalty`, or `presencePenalty`.
