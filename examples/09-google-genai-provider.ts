import 'dotenv/config';
import { generate } from '@core-ai/core-ai';
import { createGoogleGenAI } from '@core-ai/google-genai';

function getRequiredEnv(name: 'GOOGLE_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const google = createGoogleGenAI({
        apiKey: getRequiredEnv('GOOGLE_API_KEY'),
    });
    const model = google.chatModel('gemini-3-flash-preview');

    const result = await generate({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Explain why stable abstractions are useful for provider portability in one paragraph.',
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
