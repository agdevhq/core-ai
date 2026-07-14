import 'dotenv/config';
import { StreamAbortedError, stream } from '@core-ai/core-ai';
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
    const controller = new AbortController();
    let chatStream: Awaited<ReturnType<typeof stream>> | undefined;

    // Abort shortly after the request starts so the example shows partial output.
    // If your connection or model is especially fast, increase this delay.
    const timeout = setTimeout(() => {
        controller.abort();
    }, 5000);

    try {
        chatStream = await stream({
            model,
            messages: [
                {
                    role: 'user',
                    content:
                        'Start immediately with "1.". Then write one short type-safe API design tip per line, numbered sequentially. Do not add an introduction or conclusion. Keep each line under eight words and continue until stopped.',
                },
            ],
            maxTokens: 4000,
            reasoning: { effort: 'minimal' },
            signal: controller.signal,
        });
        const resultPromise = chatStream.result.catch((error: unknown) => {
            if (error instanceof StreamAbortedError) {
                return null;
            }
            throw error;
        });

        console.log('Streaming output (this example will abort after 5 seconds):\n');
        for await (const event of chatStream) {
            if (event.type === 'text-delta') {
                process.stdout.write(event.text);
            }
        }

        const response = await resultPromise;
        if (response === null) {
            throw new StreamAbortedError();
        }
        console.log('\n\nStream completed without aborting.');
        console.log('Finish reason:', response.finishReason);
        return;
    } catch (error) {
        if (error instanceof StreamAbortedError) {
            console.log('\n\nStream aborted as expected.');
            if (chatStream) {
                await chatStream.result.catch((resultError: unknown) => {
                    if (!(resultError instanceof StreamAbortedError)) {
                        throw resultError;
                    }
                });
                const events = await chatStream.events;
                console.log(`Observed ${events.length} events before abort.`);
            }
            return;
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

void main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
