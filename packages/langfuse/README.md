# @core-ai/langfuse

[![npm](https://img.shields.io/npm/v/@core-ai/langfuse.svg)](https://www.npmjs.com/package/@core-ai/langfuse)

Langfuse middleware for `@core-ai/core-ai`.

- [Langfuse](https://langfuse.com/)
- [Langfuse docs](https://langfuse.com/docs)

## Installation

```bash
npm install @core-ai/langfuse @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node
```

`@langfuse/tracing` and `@langfuse/otel` are peer dependencies. `@opentelemetry/sdk-node`
is required to register the `LangfuseSpanProcessor`.

## Setup

Create an instrumentation file and import it at your application's entry point:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

export const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();
```

## Usage

```ts
import { wrapChatModel } from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';
import { createLangfuseMiddleware } from '@core-ai/langfuse';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const model = wrapChatModel({
    model: openai.chatModel('gpt-5-mini'),
    middleware: createLangfuseMiddleware({ recordContent: true }),
});
```

`recordContent` is disabled by default. Enable it only when you want prompts, available
tool definitions, and outputs attached to Langfuse observations.
