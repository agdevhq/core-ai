# @core-ai/openai

[![npm](https://img.shields.io/npm/v/@core-ai/openai.svg)](https://www.npmjs.com/package/@core-ai/openai)

OpenAI provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/openai zod
```

## Usage

The default entrypoint uses the OpenAI **Responses API**:

```ts
import { generate } from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = openai.chatModel('gpt-5-mini');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

## Chat Completions (Compat)

For the legacy Chat Completions API — useful for Azure OpenAI, proxies, or third-party OpenAI-compatible endpoints — import from `@core-ai/openai/compat`:

```ts
import { generate } from '@core-ai/core-ai';
import { createOpenAICompat } from '@core-ai/openai/compat';

const openai = createOpenAICompat({ apiKey: process.env.OPENAI_API_KEY });
const model = openai.chatModel('gpt-5-mini');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```
