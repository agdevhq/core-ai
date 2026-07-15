import 'dotenv/config';
import { generate, ProviderError } from '@core-ai/core-ai';
import { createKimi } from '@core-ai/kimi';

function getRequiredEnv(name: 'KIMI_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getModelId(): string {
    return process.env.KIMI_MODEL ?? 'kimi-k2.7-code';
}

async function main(): Promise<void> {
    const kimi = createKimi({
        apiKey: getRequiredEnv('KIMI_API_KEY'),
    });
    const model = kimi.chatModel(getModelId());

    const result = await generate({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Implement a TypeScript function that returns the nth Fibonacci number. Reply with code only.',
            },
        ],
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
