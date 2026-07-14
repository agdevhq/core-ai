# @core-ai/core-ai

[![npm](https://img.shields.io/npm/v/@core-ai/core-ai.svg)](https://www.npmjs.com/package/@core-ai/core-ai)

Type-safe LLM abstraction layer over native provider SDKs.

## Installation

```bash
npm install @core-ai/core-ai
```

Provider packages are published separately:

- `@core-ai/openai`
- `@core-ai/anthropic`
- `@core-ai/google-genai`
- `@core-ai/mistral`

## Usage

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
