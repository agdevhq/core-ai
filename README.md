<br>
<p align="center">
  <img src="./logo.svg" alt="core-ai logo" width="128" />
</p>

<br>

<p align="center">
  <a href="https://github.com/agdevhq/core-ai/actions/workflows/ci.yml"><img src="https://github.com/agdevhq/core-ai/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@core-ai/core-ai"><img src="https://img.shields.io/npm/v/@core-ai/core-ai.svg" alt="npm" /></a>
</p>

# core-ai

A type-safe abstraction layer over LLM provider SDKs for TypeScript. Write provider-agnostic code with a unified API for chat completion, streaming, embeddings, image generation, and tool calling.

## Features

- **Unified API** across providers — switch between OpenAI, Anthropic, Mistral, and others without changing application code
- **Full type safety** — strict TypeScript types, Zod-based tool definitions, no `any`
- **Streaming** — eagerly-started replayable streams with live iteration, `result`, `events`, and `AbortSignal` support
- **Structured outputs** — schema-validated object generation and object streaming with `z.infer<TSchema>`
- **Tool / function calling** — define tools with Zod schemas, automatically converted to JSON Schema
- **Multi-modal** — text, images (base64 and URL), and file inputs
- **Embeddings & image generation** — first-class support, not just chat
- **Provider-specific options** — escape hatch via `providerOptions` when you need it
- **Lightweight** — thin wrappers over native SDKs, no heavy runtime

## Providers

| Provider              | Package                     | Chat | Streaming | Embeddings | Image Generation |
| --------------------- | --------------------------- | ---- | --------- | ---------- | ---------------- |
| OpenAI                | `@core-ai/openai`           | Yes  | Yes       | Yes        | Yes              |
| OpenAI-compatible     | `@core-ai/openai-compat`    | Yes  | Yes       | —          | —                |
| Azure OpenAI          | `@core-ai/azure-openai`     | Yes  | Yes       | —          | —                |
| Anthropic             | `@core-ai/anthropic`        | Yes  | Yes       | —          | —                |
| Google GenAI (Gemini) | `@core-ai/google-genai`     | Yes  | Yes       | Yes        | Yes              |
| Google on Vertex AI   | `@core-ai/google-vertex`    | Yes  | Yes       | Yes        | Yes              |
| Mistral               | `@core-ai/mistral`          | Yes  | Yes       | Yes        | —                |
| Omnifact              | `@core-ai/omnifact`         | Yes  | Yes       | —          | —                |
| Vertex AI Anthropic   | `@core-ai/anthropic-vertex` | Yes  | Yes       | —          | —                |

> **Note:** `@core-ai/openai` uses the Responses API by default and exposes
> strict Chat Completions through `openai.chat.chatModel()`. Use
> `@core-ai/openai-compat` for third-party compatible endpoints.

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

const chatStream = await stream({
    model,
    messages: [{ role: 'user', content: 'Tell me a story.' }],
});

// The request starts immediately; iteration is optional.
for await (const event of chatStream) {
    if (event.type === 'text-delta') {
        process.stdout.write(event.text);
    }
}

// Read the final aggregated response and full event history.
const response = await chatStream.result;
const events = await chatStream.events;
console.log(response.content);
console.log(events.length);
```

### Aborting

All generation and streaming functions accept a `signal` option (a standard `AbortSignal`) for cancellation. When the signal fires:

- **`generate` / `generateObject`** — the underlying provider request is cancelled and the promise rejects.
- **`stream` / `streamObject`** — the stream settles with a `StreamAbortedError`. The `for await` loop throws the error, and `.result` rejects. `.events` always resolves with whatever events were observed before the abort.

```typescript
import { stream, StreamAbortedError } from '@core-ai/core-ai';

const controller = new AbortController();

const chatStream = await stream({
    model,
    messages: [{ role: 'user', content: 'Write a long essay.' }],
    signal: controller.signal,
});

// Cancel after 5 seconds.
setTimeout(() => controller.abort(), 5000);

try {
    for await (const event of chatStream) {
        if (event.type === 'text-delta') {
            process.stdout.write(event.text);
        }
    }
} catch (error) {
    if (error instanceof StreamAbortedError) {
        console.log('Stream was aborted.');
        // .events still resolves with everything received so far.
        const events = await chatStream.events;
        console.log(`Received ${events.length} events before abort.`);
    }
}
```

### Part metadata

Text-bearing parts can carry application-owned `metadata` that stays with conversation history and generated results. Provider adapters ignore this field and never serialize it to provider APIs.

Use the three metadata layers for different scopes:

- `GenerateOptions.metadata` is call-level context for observability and middleware.
- `ReasoningPart.providerMetadata` is provider-owned data for reasoning round-trips.
- Part `metadata` belongs to your application and can annotate text parts, reasoning parts, tool calls, and tool results.

Streaming chat responses include `text-start` and `text-end` events around each text segment. Middleware can attach metadata to `text-end`; `.result.parts` includes that metadata on the corresponding text part.

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

const objectStream = await streamObject({
    model,
    messages: [{ role: 'user', content: 'Analyze this text and return JSON.' }],
    schema: analysisSchema,
    schemaName: 'text_analysis',
});

for await (const event of objectStream) {
    if (event.type === 'object') {
        console.log('Validated update:', event.object);
    }
}

const response = await objectStream.result;
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
    maxTokens: 1024,
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
    maxTokens: 1024,
});

console.log(result.content);
```

### Using Google on Vertex AI

```typescript
import { generate } from '@core-ai/core-ai';
import { createGoogleVertex } from '@core-ai/google-vertex';

// Uses Google Application Default Credentials (ADC) by default.
// Pass `credentials` for an explicit service account key instead.
const googleVertex = createGoogleVertex({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
const model = googleVertex.chatModel('gemini-2.5-flash');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
    maxTokens: 1024,
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
    maxTokens: 1024,
});

console.log(result.content);
```

### Using Vertex AI Anthropic

```typescript
import { generate } from '@core-ai/core-ai';
import { createAnthropicVertex } from '@core-ai/anthropic-vertex';

// Uses Google Application Default Credentials (ADC) by default.
// Pass `credentials` for an explicit service account key instead.
const anthropicVertex = createAnthropicVertex({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
const model = anthropicVertex.chatModel('claude-sonnet-4-6');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
    maxTokens: 1024,
});

console.log(result.content);
```

### Using Omnifact

```typescript
import { generate } from '@core-ai/core-ai';
import { createOmnifact } from '@core-ai/omnifact';

const omnifact = createOmnifact({ apiKey: process.env.OMNIFACT_API_KEY });

// Use an id from GET /v1/gateway/models (eu/ prefix for EU-hosted models).
const model = omnifact.chatModel('eu/gpt-5-mini');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

## Configuration

Common sampling parameters are passed as top-level fields on the generate call:

```typescript
const result = await generate({
    model,
    messages,
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
});
```

For provider-specific features, use `providerOptions` with settings nested under the provider key:

```typescript
const result = await generate({
    model,
    messages,
    providerOptions: {
        openai: {
            store: true,
            serviceTier: 'scale',
        },
    },
});
```

## Error Handling

```typescript
import { CoreAIError, ProviderError } from '@core-ai/core-ai';

try {
    await generate({ model, messages });
} catch (error) {
    if (error instanceof ProviderError) {
        console.error(
            `[${error.provider}] ${error.message} (${error.statusCode})`
        );
    } else if (error instanceof CoreAIError) {
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
  azure-openai/  — Azure OpenAI provider implementation
  anthropic/     — Anthropic provider implementation
  google-genai/  — Google GenAI (Gemini) provider implementation
  google-vertex/ — Google on Vertex AI provider implementation
  mistral/       — Mistral provider implementation
  omnifact/      — Omnifact API Gateway provider implementation
  anthropic-vertex/ — Vertex AI Anthropic (Claude) provider implementation
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
- `OMNIFACT_API_KEY`
- `GOOGLE_VERTEX_PROJECT` (Vertex AI providers; uses Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS_JSON`, plain JSON or base64)

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
