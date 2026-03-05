import 'dotenv/config';
import { generate } from '@core-ai/core-ai';
import { createMistral } from '@core-ai/mistral';

function getRequiredEnv(name: 'MISTRAL_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const mistral = createMistral({
        apiKey: getRequiredEnv('MISTRAL_API_KEY'),
    });
    const model = mistral.chatModel('mistral-small-latest');

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
    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
