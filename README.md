# core-ai

[![CI](https://github.com/agdevhq/core-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/agdevhq/core-ai/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@core-ai/core-ai.svg)](https://www.npmjs.com/package/@core-ai/core-ai)

A type-safe abstraction layer over LLM provider SDKs for TypeScript. Write provider-agnostic code with a unified API for chat completion, streaming, embeddings, image generation, and tool calling.

## Features

- **Unified API** across providers — switch between OpenAI, Anthropic, Mistral, and others without changing application code
- **Full type safety** — strict TypeScript types, Zod-based tool definitions, no `any`
- **Streaming** — async iterable-based streaming with optional aggregation via `toResponse()`
- **Structured outputs** — schema-validated object generation and object streaming with `z.infer<TSchema>`
- **Tool / function calling** — define tools with Zod schemas, automatically converted to JSON Schema
- **Multi-modal** — text, images (base64 and URL), and file inputs
- **Embeddings & image generation** — first-class support, not just chat
- **Provider-specific options** — escape hatch via `providerOptions` when you need it
- **Lightweight** — thin wrappers over native SDKs, no heavy runtime

## Providers

| Provider              | Package                      | Chat | Streaming | Embeddings | Image Generation |
| --------------------- | ---------------------------- | ---- | --------- | ---------- | ---------------- |
| OpenAI (Responses)    | `@core-ai/openai`            | Yes  | Yes       | Yes        | Yes              |
| OpenAI (Completions)  | `@core-ai/openai/compat`     | Yes  | Yes       | Yes        | Yes              |
| Anthropic             | `@core-ai/anthropic`         | Yes  | Yes       | —          | —                |
| Google GenAI (Gemini) | `@core-ai/google-genai`      | Yes  | Yes       | Yes        | Yes              |
| Mistral               | `@core-ai/mistral`           | Yes  | Yes       | Yes        | —                |

> **Note:** `@core-ai/openai` uses the OpenAI **Responses API** by default. If you need the legacy Chat Completions API (e.g. for Azure OpenAI or third-party OpenAI-compatible endpoints), import from `@core-ai/openai/compat` instead.

## Quick Start

### Installation

```bash
npm install @core-ai/core-ai
```

### Examples

For runnable, end-to-end scripts, see [`examples/README.md`](examples/README.md).

Run any example from the repository root:

```bash
npx tsx examples/01-chat-completion.ts
```

### Chat Completion

```typescript
import { generate } from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = openai.chatModel('gpt-5-mini');

const result = await generate({
    model,
    messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Explain quantum computing in one sentence.' },
    ],
});

console.log(result.content);
// => "Quantum computing uses quantum mechanical phenomena..."
console.log(result.usage);
// => { inputTokens: 25, outputTokens: 18, totalTokens: 43 }
```

### Streaming

```typescript
import { stream } from '@core-ai/core-ai';

const result = await stream({
    model,
    messages: [{ role: 'user', content: 'Tell me a story.' }],
});

for await (const event of result) {
    if (event.type === 'text-delta') {
        process.stdout.write(event.text);
    }
}

// Or aggregate the full response
const response = await result.toResponse();
console.log(response.content);
```

### Reasoning

Models that support extended thinking (e.g. `gpt-5.2`, `claude-sonnet-4.6`) return reasoning blocks alongside text. Reasoning parts carry provider-namespaced metadata so you can round-trip them through multi-turn conversations:

```typescript
import { generate, getProviderMetadata } from '@core-ai/core-ai';
import type { AnthropicReasoningMetadata } from '@core-ai/anthropic';

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Explain dark matter.' }],
    reasoning: { effort: 'high' },
});

for (const part of result.parts) {
    if (part.type === 'reasoning') {
        console.log('Reasoning:', part.text);
        const meta = getProviderMetadata<AnthropicReasoningMetadata>(
            part.providerMetadata,
            'anthropic'
        );
        console.log('Signature:', meta?.signature);
    }
}
```

When reasoning blocks from one provider are sent to a different provider, the adapter automatically downgrades them to plain text to maximize cross-provider compatibility.

### Structured Output

```typescript
import { generateObject } from '@core-ai/core-ai';
import { z } from 'zod';

const weatherSchema = z.object({
    city: z.string(),
    temperatureC: z.number(),
    summary: z.string(),
});

const result = await generateObject({
    model,
    messages: [{ role: 'user', content: 'Return weather for Berlin as JSON.' }],
    schema: weatherSchema,
    schemaName: 'weather_report',
});

console.log(result.object.city);
// => "Berlin"
```

### Structured Output Streaming

```typescript
import { streamObject } from '@core-ai/core-ai';
import { z } from 'zod';

const analysisSchema = z.object({
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    tags: z.array(z.string()),
});

const result = await streamObject({
    model,
    messages: [{ role: 'user', content: 'Analyze this text and return JSON.' }],
    schema: analysisSchema,
    schemaName: 'text_analysis',
});

for await (const event of result) {
    if (event.type === 'object') {
        console.log('Validated update:', event.object);
    }
}

const response = await result.toResponse();
console.log(response.object);
```

### Tool Calling

```typescript
import { generate, defineTool } from '@core-ai/core-ai';
import { z } from 'zod';

const weatherTool = defineTool({
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: z.object({
        location: z.string().describe('City name'),
        unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
    }),
});

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
    tools: { get_weather: weatherTool },
    toolChoice: 'auto',
});

if (result.finishReason === 'tool-calls') {
    for (const call of result.toolCalls) {
        console.log(call.name, call.arguments);
        // => "get_weather" { location: "Berlin", unit: "celsius" }
    }
}
```

### Embeddings

```typescript
import { embed } from '@core-ai/core-ai';

const embeddingModel = openai.embeddingModel('text-embedding-3-small');

const result = await embed({
    model: embeddingModel,
    input: ['Hello world', 'Goodbye world'],
    dimensions: 512,
});

console.log(result.embeddings.length); // => 2
console.log(result.usage?.inputTokens ?? 'not reported');
```

### Image Generation

```typescript
import { generateImage } from '@core-ai/core-ai';

const imageModel = openai.imageModel('dall-e-3');

const result = await generateImage({
    model: imageModel,
    prompt: 'A futuristic cityscape at sunset',
    size: '1024x1024',
});

for (const image of result.images) {
    console.log(image.url ?? image.base64?.slice(0, 40));
}
```

### Using Anthropic

```typescript
import { generate } from '@core-ai/core-ai';
import { createAnthropic } from '@core-ai/anthropic';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = anthropic.chatModel('claude-haiku-4-5');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
    config: { maxTokens: 1024 },
});

console.log(result.content);
```

### Using Google GenAI (Gemini)

```typescript
import { generate } from '@core-ai/core-ai';
import { createGoogleGenAI } from '@core-ai/google-genai';

const google = createGoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const model = google.chatModel('gemini-3-flash');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
    config: { maxTokens: 1024 },
});

console.log(result.content);
```

### Using Mistral

```typescript
import { generate } from '@core-ai/core-ai';
import { createMistral } from '@core-ai/mistral';

const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
const model = mistral.chatModel('mistral-large-latest');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
    config: { maxTokens: 1024 },
});

console.log(result.content);
```

## Configuration

All generation functions accept an optional `config` for common model parameters:

```typescript
const result = await generate({
    model,
    messages,
    config: {
        temperature: 0.7,
        maxTokens: 2048,
        topP: 0.9,
        stopSequences: ['\n\n'],
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
    },
});
```

For provider-specific features, use `providerOptions`:

```typescript
const result = await generate({
    model,
    messages,
    providerOptions: {
        // Passed directly to the provider SDK
    },
});
```

## Error Handling

```typescript
import { LLMError, ProviderError } from '@core-ai/core-ai';

try {
    await generate({ model, messages });
} catch (error) {
    if (error instanceof ProviderError) {
        console.error(
            `[${error.provider}] ${error.message} (${error.statusCode})`
        );
    } else if (error instanceof LLMError) {
        console.error(error.message);
    }
}
```

## Project Structure

This is a Turborepo monorepo:

```
packages/
  core-ai/       — Core types, functions, and provider re-exports
  openai/        — OpenAI provider (Responses API + Chat Completions compat)
  anthropic/     — Anthropic provider implementation
  google-genai/  — Google GenAI (Gemini) provider implementation
  mistral/       — Mistral provider implementation
  testing/       — Shared test utilities (internal)
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm run test

# Type-check
npm run check-types

# Lint
npm run lint

# Format
npm run format
```

## E2E Harness

Live provider end-to-end tests are implemented in
[`tests/e2e/README.md`](tests/e2e/README.md).

These tests are live API tests and run via a dedicated entrypoint. They do not
run as part of `npm run test`.

```bash
# Run shared provider E2E harness
npm run test:e2e
```

Provider keys:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `MISTRAL_API_KEY`

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
