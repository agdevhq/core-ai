# @core-ai/vertex-anthropic

[![npm](https://img.shields.io/npm/v/@core-ai/vertex-anthropic.svg)](https://www.npmjs.com/package/@core-ai/vertex-anthropic)

Vertex AI Anthropic (Claude) provider package for `@core-ai/core-ai`. It uses the [`@anthropic-ai/vertex-sdk`](https://www.npmjs.com/package/@anthropic-ai/vertex-sdk) client and shares its request, streaming, tool-calling, structured-output, and reasoning behavior with `@core-ai/anthropic`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/vertex-anthropic zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createVertexAnthropic } from '@core-ai/vertex-anthropic';

const vertexAnthropic = createVertexAnthropic({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
const model = vertexAnthropic.chatModel('claude-sonnet-4-6');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

## Authentication

By default, the provider uses [Google Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials):

```ts
const vertexAnthropic = createVertexAnthropic({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
```

To authenticate with an explicit service account instead, parse its JSON key and pass it as `credentials`:

```ts
const vertexAnthropic = createVertexAnthropic({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
    credentials: JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? ''
    ),
});
```

You can also inject a preconfigured client (for example a custom `AnthropicVertex` instance, or one wired up for testing):

```ts
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

const vertexAnthropic = createVertexAnthropic({
    client: new AnthropicVertex({ projectId: 'my-project', region: 'eu' }),
});
```

## Model IDs and regions

Pass the Vertex model ID (as listed in the [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/publishers/anthropic/model-garden)) to `chatModel()`. Model availability and naming vary by region — for example, some Claude models are only published to Vertex AI's `eu` multi-region while others are published to region-specific endpoints like `europe-west1`. Since a provider instance targets a single region, create separate providers if you need to reach models hosted in different regions:

```ts
const vertexAnthropicEu = createVertexAnthropic({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'eu',
});
const vertexAnthropicEuWest1 = createVertexAnthropic({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
```

This package supports chat models only.

> **Caveat:** Pass the unversioned Vertex model id (e.g. `claude-sonnet-4-6`) rather than a version-pinned id (e.g. `claude-sonnet-4-6@20250929`). Reasoning-effort and sampling-restriction capability detection (`getAnthropicModelCapabilities` and friends in `@core-ai/anthropic`) only recognizes the unversioned form today, so a version-pinned id silently falls back to standard capabilities instead of the model's actual ones.

## Provider options and model capabilities

This provider shares its request, streaming, and reasoning behavior with `@core-ai/anthropic`. Provider-options schemas (`anthropicGenerateProviderOptionsSchema`), reasoning metadata types (`AnthropicReasoningMetadata`), and model capability helpers (`getAnthropicModelCapabilities`) are available from `@core-ai/anthropic` and apply equally to Vertex-hosted Claude models.
