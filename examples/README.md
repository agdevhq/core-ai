# Runnable Examples

These scripts show how to use `@core-ai/core-ai` features end-to-end.

These are usage examples, not automated contract checks. For the shared
provider E2E harness, use
[`tests/e2e/README.md`](../tests/e2e/README.md).

## Prerequisites

- Node.js 18+
- Dependencies installed from the repository root:

```bash
npm install
```

## Environment Variables

Create a `.env` file at the repository root:

```bash
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_API_KEY=your_google_api_key
MISTRAL_API_KEY=your_mistral_api_key
OMNIFACT_API_KEY=your_omnifact_org_api_key
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
GOOGLE_VERTEX_PROJECT=your_google_cloud_project_id
```

`ANTHROPIC_API_KEY` is only required for the Anthropic example.
`GOOGLE_API_KEY` is only required for the Google GenAI example.
`MISTRAL_API_KEY` is only required for the Mistral example.
`OMNIFACT_API_KEY` is only required for the Omnifact example.
Optional: `OMNIFACT_MODEL` overrides the model id (default in the example: `eu/gpt-5-mini`). Use ids from `GET /v1/gateway/models`.
`AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT` are only required for the Azure OpenAI example.
Optional: `AZURE_OPENAI_DEPLOYMENT` overrides the deployment name (default in the example: `gpt-5-mini`). Set `AZURE_OPENAI_API=classic` to use the classic Azure API; `AZURE_OPENAI_API_VERSION` overrides the classic API version.
`GOOGLE_VERTEX_PROJECT` is required for the Vertex AI examples. They use Application Default Credentials — run `gcloud auth application-default login` first, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account key file.
Optional: `GOOGLE_VERTEX_REGION` overrides the region (default: `europe-west1`); `ANTHROPIC_VERTEX_MODEL` and `GOOGLE_VERTEX_MODEL` override the respective model ids.

## Run an Example

From the repository root:

```bash
npx tsx examples/01-chat-completion.ts
```

The telemetry example uses a real OpenAI model and requires `OPENAI_API_KEY`:

```bash
npx tsx examples/18-telemetry-console-exporter.ts
```

## Available Examples

- `01-chat-completion.ts`: Basic `generate()` chat completion with OpenAI
- `02-streaming.ts`: Streaming output with `stream()`, `result`, and `events`
- `03-tool-calling.ts`: Tool definition and a full tool-call round trip
- `04-multi-modal.ts`: Multi-modal input using text + image URL
- `05-embeddings.ts`: Embeddings with `embed()`
- `06-image-generation.ts`: Image generation with `generateImage()`
- `07-error-handling.ts`: Handling `CoreAIError` and `ProviderError`
- `08-anthropic-provider.ts`: Using Anthropic with the same `generate()` API
- `09-google-genai-provider.ts`: Using Google GenAI (Gemini) with the same `generate()` API
- `10-mistral-provider.ts`: Using Mistral with the same `generate()` API
- `11-omnifact-provider.ts`: Using Omnifact API Gateway with the same `generate()` API
- `12-azure-openai-provider.ts`: Using Azure OpenAI deployments with the same `generate()` API
- `13-anthropic-vertex-provider.ts`: Using Claude on Vertex AI with the same `generate()` API
- `14-google-genai-vertex-provider.ts`: Using Gemini on Vertex AI with the same `generate()` API
- `15-generate-object.ts`: Typed structured output with `generateObject()`
- `16-stream-object.ts`: Streaming structured output with `streamObject()`
- `17-stream-abort.ts`: Cancelling a streaming call with `AbortController`
- `18-telemetry-console-exporter.ts`: OpenAI-backed telemetry example that exports spans with the OpenTelemetry console exporter
- `19-telemetry-axiom-exporter.ts`: OpenAI-backed telemetry example that exports spans to Axiom
