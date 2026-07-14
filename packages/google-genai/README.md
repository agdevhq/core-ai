# @core-ai/google-genai

[![npm](https://img.shields.io/npm/v/@core-ai/google-genai.svg)](https://www.npmjs.com/package/@core-ai/google-genai)

Google GenAI provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/google-genai zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createGoogleGenAI } from '@core-ai/google-genai';

const google = createGoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const model = google.chatModel('gemini-3-flash');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```
