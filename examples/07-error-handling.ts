import 'dotenv/config';
import {
    ContextLengthExceededError,
    CoreAIError,
    ModelOverloadedError,
    ProviderError,
    RateLimitError,
    ServiceUnavailableError,
    generate,
} from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';

function getRequiredEnv(name: 'OPENAI_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function handleError(error: unknown): void {
    if (error instanceof ContextLengthExceededError) {
        console.error('ContextLengthExceededError');
        console.error(`provider: ${error.provider}`);
        console.error(`code: ${error.code}`);
        console.error(`maxTokens: ${error.maxTokens ?? 'n/a'}`);
        console.error(`actualTokens: ${error.actualTokens ?? 'n/a'}`);
        console.error(`message: ${error.message}`);
        return;
    }

    if (error instanceof RateLimitError) {
        console.error('RateLimitError');
        console.error(`provider: ${error.provider}`);
        console.error(`code: ${error.code}`);
        console.error(`retryAfterSeconds: ${error.retryAfterSeconds ?? 'n/a'}`);
        console.error(`isRetryable: ${error.isRetryable}`);
        console.error(`message: ${error.message}`);
        return;
    }

    if (error instanceof ModelOverloadedError) {
        console.error('ModelOverloadedError');
        console.error(`provider: ${error.provider}`);
        console.error(`code: ${error.code}`);
        console.error(`isRetryable: ${error.isRetryable}`);
        console.error(`message: ${error.message}`);
        return;
    }

    if (error instanceof ServiceUnavailableError) {
        console.error('ServiceUnavailableError');
        console.error(`provider: ${error.provider}`);
        console.error(`code: ${error.code}`);
        console.error(`isRetryable: ${error.isRetryable}`);
        console.error(`message: ${error.message}`);
        return;
    }

    if (error instanceof ProviderError) {
        console.error('ProviderError');
        console.error(`provider: ${error.provider}`);
        console.error(`code: ${error.code}`);
        console.error(`statusCode: ${error.statusCode ?? 'n/a'}`);
        console.error(`isRetryable: ${error.isRetryable}`);
        console.error(`message: ${error.message}`);
        return;
    }

    if (error instanceof CoreAIError) {
        console.error('CoreAIError');
        console.error(error.message);
        return;
    }

    if (error instanceof Error) {
        console.error('Unexpected Error');
        console.error(error.message);
        return;
    }

    console.error('Unknown error:', error);
}

async function main(): Promise<void> {
    const openai = createOpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
    const model = openai.chatModel('gpt-5-mini');

    // Example 1: Local validation error from core-ai.
    try {
        await generate({
            model,
            messages: [],
        });
    } catch (error) {
        console.log('Caught local validation error as expected:');
        handleError(error);
    }

    // Example 2: Provider call with classified error handling.
    try {
        const result = await generate({
            model,
            messages: [{ role: 'user', content: 'Say hello in one word.' }],
        });
        console.log('Success:', result.content);
    } catch (error) {
        console.log('Caught provider/runtime error:');
        handleError(error);
    }
}

void main().catch((error: unknown) => {
    handleError(error);
    process.exitCode = 1;
});
