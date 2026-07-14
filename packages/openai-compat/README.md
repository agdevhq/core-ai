# @core-ai/openai-compat

OpenAI-compatible Chat Completions provider for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/openai-compat zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createOpenAICompat } from '@core-ai/openai-compat';

const provider = createOpenAICompat({
    apiKey: process.env.API_KEY,
    baseURL: 'https://gateway.example.com/v1',
});

const result = await generate({
    model: provider.chatModel('qwen3-235b'),
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

This provider only exposes Chat Completions models. It accepts known
nonstandard response fields used by OpenAI-compatible gateways, including
`reasoning_content` and `reasoning`. Set `reasoning: false` when those fields
should not be interpreted as reasoning output.

Structured output uses a forced function tool by default for broad endpoint
compatibility. If the endpoint supports strict JSON Schema response formats,
opt in with `structuredOutputMode: 'native'`:

```ts
const provider = createOpenAICompat({
    apiKey: process.env.API_KEY,
    baseURL: 'https://gateway.example.com/v1',
    structuredOutputMode: 'native',
});
```
