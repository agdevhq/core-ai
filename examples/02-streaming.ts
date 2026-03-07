import 'dotenv/config';
import { stream } from '@core-ai/core-ai';
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

    const chatStream = await stream({
        model,
        messages: [
            {
                role: 'user',
                content: 'Write a short haiku about strongly typed APIs.',
            },
        ],
    });

    console.log('Streaming output:\n');
    for await (const event of chatStream) {
        if (event.type === 'text-delta') {
            process.stdout.write(event.text);
        }
    }

    const response = await chatStream.result;
    const events = await chatStream.events;
    console.log('\n\nFinish reason:', response.finishReason);
    console.log('Usage:', response.usage);
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
