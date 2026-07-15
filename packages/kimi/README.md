# @core-ai/kimi

[![npm](https://img.shields.io/npm/v/@core-ai/kimi.svg)](https://www.npmjs.com/package/@core-ai/kimi)

Kimi (Moonshot AI) provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/kimi zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createKimi } from '@core-ai/kimi';

const kimi = createKimi({
    apiKey: process.env.KIMI_API_KEY,
});

const model = kimi.chatModel('kimi-k2.7-code');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Implement quicksort in TypeScript.' }],
    maxTokens: 32768,
});

console.log(result.content);
```

By default, requests go to `https://api.moonshot.ai/v1`. Set `baseURL` to use a custom endpoint.

## Supported models

- `kimi-k2.7-code` — coding-focused agentic model with always-on thinking
- `kimi-k2.7-code-highspeed` — same model with higher output speed

## Reasoning and preserved thinking

Kimi K2.7 Code always runs in thinking mode. The provider maps Moonshot's `reasoning_content` field to core-ai reasoning parts and preserves it across multi-turn conversations via `resultToMessage()`.

## Fixed sampling constraints

For `kimi-k2.7-code` and `kimi-k2.7-code-highspeed`, Moonshot fixes sampling parameters server-side. Do not pass custom `temperature` or `topP` values — the provider validates these locally and omits fixed parameters from requests.

## Structured output

`generateObject()` and `streamObject()` use Moonshot JSON Mode (`response_format: { type: 'json_object' }`) and validate the returned JSON with your Zod schema.

You can also use JSON Mode directly with `generate()` or `stream()` and parse JSON from `result.content`:

```ts
const result = await generate({
    model,
    messages: [
        {
            role: 'user',
            content:
                'Return only valid JSON matching {"city": string, "temperatureC": number}.',
        },
    ],
    providerOptions: {
        kimi: {
            responseFormat: { type: 'json_object' },
        },
    },
});

const object = schema.parse(JSON.parse(result.content ?? '{}'));
```

Forced tool choice via `toolChoice: { type: 'tool', toolName }` is rejected on K2.7 Code models because Moonshot does not allow forced tool selection while thinking is always enabled.

## Provider options

Pass Kimi-specific options via `providerOptions.kimi`:

```ts
await generate({
    model,
    messages: [{ role: 'user', content: 'Hello' }],
    providerOptions: {
        kimi: {
            parallelToolCalls: true,
            responseFormat: { type: 'json_object' },
            stopSequences: ['END'],
        },
    },
});
```
