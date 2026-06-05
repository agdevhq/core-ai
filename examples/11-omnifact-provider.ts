import 'dotenv/config';
import { generate, ProviderError } from '@core-ai/core-ai';
import { createOmnifact } from '@core-ai/omnifact';

function getRequiredEnv(name: 'OMNIFACT_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getModelId(): string {
    // Use ids from GET /v1/gateway/models. EU-hosted models require the eu/ prefix.
    return process.env.OMNIFACT_MODEL ?? 'eu/gpt-5-mini';
}

async function main(): Promise<void> {
    const omnifact = createOmnifact({
        apiKey: getRequiredEnv('OMNIFACT_API_KEY'),
    });
    const model = omnifact.chatModel(getModelId());

    const result = await generate({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Explain why composable provider abstractions improve AI application portability in one paragraph.',
            },
        ],
        maxTokens: 256,
    });

    console.log('Response:\n', result.content);
    console.log('\nUsage:', result.usage);
}

void main().catch((error: unknown) => {
    if (error instanceof ProviderError) {
        console.error(`${error.statusCode} "${error.message}"`);
    } else if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
