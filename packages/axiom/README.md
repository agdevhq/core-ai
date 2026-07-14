# @core-ai/axiom

[![npm](https://img.shields.io/npm/v/@core-ai/axiom.svg)](https://www.npmjs.com/package/@core-ai/axiom)

Axiom GenAI telemetry middleware for `@core-ai/core-ai`.

## Installation

```bash
npm install @core-ai/axiom @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

`@opentelemetry/api` is a peer dependency. Configure an OpenTelemetry SDK in your application to export spans to Axiom.

## Usage

```ts
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { generate, wrapChatModel } from '@core-ai/core-ai';
import { createAxiomExporterOptions, createAxiomMiddleware } from '@core-ai/axiom';
import { createOpenAI } from '@core-ai/openai';

function getRequiredEnv(
    name: 'AXIOM_DATASET' | 'AXIOM_TOKEN' | 'OPENAI_API_KEY'
): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(
        createAxiomExporterOptions({
            token: getRequiredEnv('AXIOM_TOKEN'),
            dataset: getRequiredEnv('AXIOM_DATASET'),
        })
    ),
});

sdk.start();

const openai = createOpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
const model = wrapChatModel({
    model: openai.chatModel('gpt-5-mini'),
    middleware: [createAxiomMiddleware()],
});

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});
```

Axiom provisions a GenAI dashboard for datasets that receive spans with `gen_ai.*` attributes. The Axiom middleware is an Axiom-branded wrapper around `@core-ai/opentelemetry`, so it emits OpenTelemetry GenAI semantic convention attributes for chat, embeddings, and image generation.
