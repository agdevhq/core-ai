# @core-ai/anthropic

[![npm](https://img.shields.io/npm/v/@core-ai/anthropic.svg)](https://www.npmjs.com/package/@core-ai/anthropic)

Anthropic provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/anthropic zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createAnthropic } from '@core-ai/anthropic';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = anthropic.chatModel('claude-haiku-4-5');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```
