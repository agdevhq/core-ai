import 'dotenv/config';
import { createAnthropicAdapter } from './adapters/anthropic.adapter.ts';
import { createGoogleGenAIAdapter } from './adapters/google-genai.adapter.ts';
import { createMistralAdapter } from './adapters/mistral.adapter.ts';
import { createOpenAIAdapter } from './adapters/openai.adapter.ts';
import { runProviderContractSuite } from './runner/run-provider-contract-suite.ts';

const adapters = [
    createOpenAIAdapter(),
    createAnthropicAdapter(),
    createGoogleGenAIAdapter(),
    createMistralAdapter(),
];

for (const adapter of adapters) {
    runProviderContractSuite(adapter);
}
