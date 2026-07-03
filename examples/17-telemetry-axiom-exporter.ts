import 'dotenv/config';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { generate, stream, wrapChatModel } from '@core-ai/core-ai';
import { createAxiomExporterOptions, createAxiomMiddleware } from '@core-ai/axiom';
import { createOpenAI } from '@core-ai/openai';

function getRequiredEnv(
    name: 'AXIOM_DATASET' | 'AXIOM_TOKEN' | 'OPENAI_API_KEY'
): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter(
            createAxiomExporterOptions({
                token: getRequiredEnv('AXIOM_TOKEN'),
                dataset: getRequiredEnv('AXIOM_DATASET'),
            })
        ),
    });

    sdk.start();

    const openai = createOpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
    const baseModel = openai.chatModel('gpt-5-mini');
    const model = wrapChatModel({
        model: baseModel,
        middleware: [createAxiomMiddleware({ recordContent: true })],
    });
    const redactedModel = wrapChatModel({
        model: baseModel,
        middleware: [createAxiomMiddleware()],
    });

    console.log('Running generate() with Axiom content recording enabled...\n');

    try {
        const generateResult = await generate({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a concise assistant.',
                },
                {
                    role: 'user',
                    content:
                        'Explain in one short paragraph what Axiom GenAI telemetry shows.',
                },
            ],
            metadata: {
                functionId: 'examples.axiom.generate',
            },
        });

        console.log('generate() content:\n', generateResult.content);
        console.log();
        console.log('Running stream() with Axiom content recording disabled...\n');

        const chatStream = await stream({
            model: redactedModel,
            messages: [
                {
                    role: 'user',
                    content:
                        'Write a two-line poem about AI traces and dashboards.',
                },
            ],
            metadata: {
                functionId: 'examples.axiom.stream',
            },
        });

        const streamResult = await chatStream.result;
        console.log('\nstream() result:\n', streamResult.content);
        console.log();
    } finally {
        await sdk.shutdown();
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
