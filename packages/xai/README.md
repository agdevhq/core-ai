# @core-ai/xai

[![npm](https://img.shields.io/npm/v/@core-ai/xai.svg)](https://www.npmjs.com/package/@core-ai/xai)

xAI (Grok) provider package for `@core-ai/core-ai`.

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

const model = xai.chatModel('grok-4.7');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Explain quantum tunneling briefly.' }],
});

console.log(result.content);
```

By default, requests go to `https://api.x.ai/v1`. Set `baseURL` to use a custom or regional endpoint.

## Responses and Chat Completions

`xai.chatModel()` uses xAI's Responses API, the recommended API for Grok models. Requests are stateless: the provider sends `store: false` and round-trips encrypted reasoning content instead of relying on server-side conversation state.

`xai.chat.chatModel()` uses the legacy Chat Completions API.

## Reasoning

| Model                                                                      | Reasoning     | Effort control                 |
| -------------------------------------------------------------------------- | ------------- | ------------------------------ |
| `grok-4.7`, `grok-4.6`, `grok-4.5`                                         | Always on     | `low`, `medium`, `high`, `max` |
| `grok-4.3`                                                                 | On by default | `low`, `medium`, `high`, `max` |
| `grok-4.20-0309-reasoning`, `grok-4.20-multi-agent-0309`, `grok-build-0.1` | Always on     | None                           |
| `grok-4.20-0309-non-reasoning`                                             | Not supported | None                           |

`max` is sent to xAI as `xhigh`. `minimal` is clamped to `low`. Models without effort control never receive an effort parameter.

Reasoning is preserved across turns when you pass `resultToMessage(result)` back in `messages`: as encrypted reasoning items on the Responses API, and as `reasoning_content` on Chat Completions.

## Usage reporting

`usage.outputTokens` always includes reasoning tokens on both APIs. xAI's Chat Completions API reports reasoning tokens separately from `completion_tokens`; the provider adds them.

## Structured output and tools

`generateObject()` and `streamObject()` use xAI's native `json_schema` structured output. Every Grok model supports strict tool schemas (`strict: true` on a tool) and accepts text and image input.

## Provider options

Pass xAI-specific options via `providerOptions.xai`:

```ts
await generate({
    model: xai.chatModel('grok-4.7'),
    messages: [{ role: 'user', content: 'Hello' }],
    providerOptions: {
        xai: {
            promptCacheKey: 'conversation-42',
            parallelToolCalls: false,
        },
    },
});
```

- Responses API: `store`, `include`, `parallelToolCalls`, `user`, `promptCacheKey`
- Chat Completions API: `parallelToolCalls`, `seed`, `user`

Stop sequences and frequency/presence penalties are not available: xAI reasoning models reject them.

## Not supported

Embeddings, image generation, and xAI's server-side tools (web search, X search, code execution, remote MCP) are not available through this package.
