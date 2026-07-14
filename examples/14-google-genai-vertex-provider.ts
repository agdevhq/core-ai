import 'dotenv/config';
import { generate } from '@core-ai/core-ai';
import { createGoogleGenAIVertex } from '@core-ai/google-genai-vertex';

function getRequiredEnv(name: 'GOOGLE_VERTEX_PROJECT'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const googleVertex = createGoogleGenAIVertex({
        projectId: getRequiredEnv('GOOGLE_VERTEX_PROJECT'),
        region: process.env['GOOGLE_VERTEX_REGION'] ?? 'europe-west1',
    });
    const model = googleVertex.chatModel(
        process.env['GOOGLE_VERTEX_MODEL'] ?? 'gemini-2.5-flash'
    );

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
