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

## Chat Completions

The same provider exposes OpenAI's strict Chat Completions API under `chat`:

```ts
import { generate } from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = openai.chat.chatModel('gpt-5-mini');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

Use `@core-ai/openai-compat` for third-party Chat Completions endpoints that
return nonstandard compatible fields.
