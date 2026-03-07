import 'dotenv/config';
import { z } from 'zod';
import { streamObject } from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';

function getRequiredEnv(name: 'OPENAI_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const openai = createOpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
    const model = openai.chatModel('gpt-5-mini');

    const extractSchema = z.object({
        headline: z.string(),
        sentiment: z.enum(['positive', 'neutral', 'negative']),
        tags: z.array(z.string()),
    });

    const objectStream = await streamObject({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Analyze this sentence and return JSON only: "Core AI makes provider integration easier."',
            },
        ],
        schema: extractSchema,
        schemaName: 'text_analysis',
        schemaDescription: 'Structured text analysis output.',
    });

    for await (const event of objectStream) {
        if (event.type === 'object-delta') {
            process.stdout.write(event.text);
            continue;
        }

        if (event.type === 'object') {
            console.log('\n\nValidated object update:', event.object);
        }
    }

    const response = await objectStream.result;
    const events = await objectStream.events;
    console.log('\nFinal object:', response.object);
    console.log('Finish reason:', response.finishReason);
    console.log('Event count:', events.length);
}

void main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
