# @core-ai/mistral

Mistral provider package for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/mistral zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createMistral } from '@core-ai/mistral';

const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
const model = mistral.chatModel('mistral-large-latest');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```
