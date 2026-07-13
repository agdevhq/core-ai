import 'dotenv/config';
import { z } from 'zod';
import { generateObject } from '@core-ai/core-ai';
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

    const weatherSchema = z.object({
        city: z.string(),
        temperatureC: z.number(),
        summary: z.string(),
    });

    const result = await generateObject({
        model,
        messages: [
            {
                role: 'user',
                content:
                    'Return a weather report for Berlin as structured JSON.',
            },
        ],
        schema: weatherSchema,
        schemaName: 'weather_report',
        schemaDescription: 'A structured weather report object.',
    });

    console.log('Structured object:\n', result.object);
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
