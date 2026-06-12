import 'dotenv/config';
import { generate, ProviderError } from '@core-ai/core-ai';
import { createAzureOpenAI } from '@core-ai/azure-openai';

function getRequiredEnv(
    name: 'AZURE_OPENAI_API_KEY' | 'AZURE_OPENAI_ENDPOINT'
): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getDeploymentName(): string {
    return process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5-mini';
}

function getApiVersion(): string {
    return process.env.AZURE_OPENAI_API_VERSION ?? '2025-04-01-preview';
}

function createProvider() {
    const apiKey = getRequiredEnv('AZURE_OPENAI_API_KEY');
    const endpoint = getRequiredEnv('AZURE_OPENAI_ENDPOINT');

    if (process.env.AZURE_OPENAI_API === 'classic') {
        return createAzureOpenAI({
            api: 'classic',
            apiKey,
            endpoint,
            apiVersion: getApiVersion(),
        });
    }

    return createAzureOpenAI({
        apiKey,
        endpoint,
    });
}

async function main(): Promise<void> {
    const azure = createProvider();
    const model = azure.chatModel(getDeploymentName());

    const result = await generate({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Explain why deployment names matter for Azure OpenAI in one paragraph.',
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
