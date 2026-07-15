import 'dotenv/config';
import { generate, ProviderError } from '@core-ai/core-ai';
import { createXAI } from '@core-ai/xai';

function getRequiredEnv(name: 'XAI_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getModelId(): string {
    return process.env.XAI_MODEL ?? 'grok-4.3';
}

async function main(): Promise<void> {
    const xai = createXAI({
        apiKey: getRequiredEnv('XAI_API_KEY'),
    });
    const model = xai.chatModel(getModelId());

    const result = await generate({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Explain the difference between TCP and UDP in one paragraph.',
            },
        ],
        reasoning: { effort: 'low' },
        maxTokens: 4096,
    });

    if (result.reasoning) {
        console.log('Reasoning:\n', result.reasoning);
    }

    console.log('\nResponse:\n', result.content);
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
