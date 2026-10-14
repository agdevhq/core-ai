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
const model = google.chatModel('gemini-4-argon');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

## Image generation

`imageModel()` supports Gemini native image models:

```ts
import { generateImage } from '@core-ai/core-ai';

const result = await generateImage({
    model: google.imageModel('gemini-nano-banana-2.1'),
    prompt: 'A watercolor robot in a mountain cabin at sunrise',
    size: '1024x1024',
});

console.log(result.images[0]?.base64);
```

Gemini image models use native multimodal generation and return base64 image
data.
