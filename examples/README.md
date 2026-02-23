# Runnable Examples

These scripts show how to use `@core-ai/core-ai` features end-to-end.

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
```

`ANTHROPIC_API_KEY` is only required for the Anthropic example.
`GOOGLE_API_KEY` is only required for the Google GenAI example.
`MISTRAL_API_KEY` is only required for the Mistral example.

## Run an Example

From the repository root:

```bash
npx tsx examples/01-chat-completion.ts
```

## Available Examples

- `01-chat-completion.ts`: Basic `generate()` chat completion with OpenAI
- `02-streaming.ts`: Streaming output with `stream()` and `toResponse()`
- `03-tool-calling.ts`: Tool definition and a full tool-call round trip
- `04-multi-modal.ts`: Multi-modal input using text + image URL
- `05-embeddings.ts`: Embeddings with `embed()`
- `06-image-generation.ts`: Image generation with `generateImage()`
- `07-error-handling.ts`: Handling `LLMError` and `ProviderError`
- `08-anthropic-provider.ts`: Using Anthropic with the same `generate()` API
- `09-google-genai-provider.ts`: Using Google GenAI (Gemini) with the same `generate()` API
- `10-mistral-provider.ts`: Using Mistral with the same `generate()` API
