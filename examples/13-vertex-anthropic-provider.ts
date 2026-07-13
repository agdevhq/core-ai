import 'dotenv/config';
import { generate } from '@core-ai/core-ai';
import { createVertexAnthropic } from '@core-ai/vertex-anthropic';

function getRequiredEnv(name: 'GOOGLE_VERTEX_PROJECT'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const vertexAnthropic = createVertexAnthropic({
        projectId: getRequiredEnv('GOOGLE_VERTEX_PROJECT'),
        region: process.env['GOOGLE_VERTEX_REGION'] ?? 'europe-west1',
    });
    const model = vertexAnthropic.chatModel(
        process.env['VERTEX_ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6'
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
