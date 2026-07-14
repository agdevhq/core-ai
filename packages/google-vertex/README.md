# @core-ai/google-vertex

[![npm](https://img.shields.io/npm/v/@core-ai/google-vertex.svg)](https://www.npmjs.com/package/@core-ai/google-vertex)

Google on Vertex AI provider package for `@core-ai/core-ai`. It uses the [`@google/genai`](https://www.npmjs.com/package/@google/genai) client in Vertex AI mode and shares chat, embedding, image generation, structured-output, and reasoning behavior with `@core-ai/google-genai`.

## Installation

```bash
npm install @core-ai/core-ai @core-ai/google-vertex zod
```

## Usage

```ts
import { generate } from '@core-ai/core-ai';
import { createGoogleVertex } from '@core-ai/google-vertex';

const googleVertex = createGoogleVertex({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
const model = googleVertex.chatModel('gemini-2.5-flash');

const result = await generate({
    model,
    messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.content);
```

## Authentication

By default, the provider uses [Google Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials):

```ts
const googleVertex = createGoogleVertex({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
});
```

To authenticate with an explicit service account, parse its JSON key and pass it as `credentials`:

```ts
const googleVertex = createGoogleVertex({
    projectId: process.env.GOOGLE_VERTEX_PROJECT,
    region: 'europe-west1',
    credentials: JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? ''
    ),
});
```

You can also inject a preconfigured `GoogleGenAI` client:

```ts
import { GoogleGenAI } from '@google/genai';

const googleVertex = createGoogleVertex({
    client: new GoogleGenAI({
        vertexai: true,
        project: 'my-project',
        location: 'europe-west1',
    }),
});
```

## Models and regions

Pass Vertex AI model IDs to the corresponding model factory:

```ts
const chat = googleVertex.chatModel('gemini-2.5-flash');
const embeddings = googleVertex.embeddingModel('gemini-embedding-001');
const image = googleVertex.imageModel('imagen-4.0-generate-001');
```

Model availability varies by region. A provider instance targets one region, so create separate providers when models are hosted in different locations.

## Provider options and capabilities

This provider shares its model behavior with `@core-ai/google-genai`. Provider options remain namespaced under `google`, and the capability helpers and reasoning metadata types exported by `@core-ai/google-genai` apply to Vertex-hosted models.
