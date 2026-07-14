# @core-ai/google

[![npm](https://img.shields.io/npm/v/@core-ai/google.svg)](https://www.npmjs.com/package/@core-ai/google)

Google provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/google zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createGoogle } from '@core-ai/google';

const google = createGoogle({ apiKey: process.env.GOOGLE_API_KEY });
const model = google.chatModel('gemini-3-flash');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```
