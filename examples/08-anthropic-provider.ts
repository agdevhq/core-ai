import 'dotenv/config';
import { generate } from '@core-ai/core-ai';
import { createAnthropic } from '@core-ai/anthropic';

function getRequiredEnv(name: 'ANTHROPIC_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const anthropic = createAnthropic({
        apiKey: getRequiredEnv('ANTHROPIC_API_KEY'),
    });
    const model = anthropic.chatModel('claude-haiku-4-5');

    const result = await generate({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Explain why strong typing helps library users in one paragraph.',
            },
        ],
        maxTokens: 256,
    });

    console.log('Response:\n', result.content);
    console.log('\nUsage:', result.usage);
}

void main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
