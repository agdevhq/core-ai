import { expect } from 'vitest';
import { z } from 'zod';
import {
    embed,
    generate,
    generateImage,
    generateObject,
    stream,
} from '../../../packages/core-ai/src/index.ts';
import type { ProviderCapabilities } from './adapters/provider-adapter.ts';
import type { ProviderE2EAdapter } from './adapters/provider-adapter.ts';

export type ProviderContractCaseId =
    | 'chatGenerate'
    | 'chatStream'
    | 'generateObject'
    | 'embed'
    | 'generateImage';

export type ProviderContractCapability = keyof ProviderCapabilities;

export type ProviderContractContext = {
    adapter: ProviderE2EAdapter;
};

export type ProviderContractCase = {
    id: ProviderContractCaseId;
    name: string;
    requiredCapability: ProviderContractCapability;
    timeoutMs?: number;
    run: (context: ProviderContractContext) => Promise<void>;
};

const objectSchema = z.object({
    topic: z.string(),
    isTestRelated: z.boolean(),
});

export const providerCases: ProviderContractCase[] = [
    {
        id: 'chatGenerate',
        name: 'generate returns non-empty content with usage',
        requiredCapability: 'chat',
        run: async ({ adapter }) => {
            const model = adapter.createChatModel();
            const result = await generate({
                model,
                messages: [
                    {
                        role: 'user',
                        content:
                            'Explain in one sentence why end-to-end tests matter.',
                    },
                ],
            });

            expect(result.content).toBeTypeOf('string');
            expect(result.content?.trim().length ?? 0).toBeGreaterThan(0);
            expect(Array.isArray(result.toolCalls)).toBe(true);
            assertChatUsage(result.usage);
        },
    },
    {
        id: 'chatStream',
        name: 'stream emits deltas and aggregates response',
        requiredCapability: 'stream',
        run: async ({ adapter }) => {
            const model = adapter.createChatModel();
            const result = await stream({
                model,
                messages: [
                    {
                        role: 'user',
                        content:
                            'Write one short sentence about reliable software testing.',
                    },
                ],
            });

            let sawContentDelta = false;
            let streamedText = '';
            for await (const event of result) {
                if (event.type === 'content-delta') {
                    sawContentDelta = true;
                    streamedText += event.text;
                }
            }

            const response = await result.toResponse();
            expect(sawContentDelta).toBe(true);
            expect(streamedText.trim().length).toBeGreaterThan(0);
            expect(response.content).toBeTypeOf('string');
            expect(response.content?.trim().length ?? 0).toBeGreaterThan(0);
            assertChatUsage(response.usage);
        },
    },
    {
        id: 'generateObject',
        name: 'generateObject returns schema-valid output',
        requiredCapability: 'object',
        run: async ({ adapter }) => {
            const model = adapter.createChatModel();
            const result = await generateObject({
                model,
                messages: [
                    {
                        role: 'user',
                        content:
                            'Return an object with fields topic and isTestRelated for "integration tests".',
                    },
                ],
                schema: objectSchema,
                schemaName: 'test_topic_schema',
            });

            expect(result.object.topic.trim().length).toBeGreaterThan(0);
            expect(typeof result.object.isTestRelated).toBe('boolean');
            assertChatUsage(result.usage);
        },
    },
    {
        id: 'embed',
        name: 'embed returns vectors for each input',
        requiredCapability: 'embedding',
        run: async ({ adapter }) => {
            const model = adapter.createEmbeddingModel?.();
            if (!model) {
                throw new Error(`Missing embedding model factory for ${adapter.id}`);
            }

            const result = await embed({
                model,
                input: ['unit testing', 'integration testing'],
            });

            expect(result.embeddings.length).toBe(2);
            for (const vector of result.embeddings) {
                expect(vector.length).toBeGreaterThan(0);
                expect(vector.every((value) => Number.isFinite(value))).toBe(true);
            }

            if (result.usage) {
                expect(Number.isFinite(result.usage.inputTokens)).toBe(true);
                expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0);
            }
        },
    },
    {
        id: 'generateImage',
        name: 'generateImage returns at least one image',
        requiredCapability: 'image',
        run: async ({ adapter }) => {
            const model = adapter.createImageModel?.();
            if (!model) {
                throw new Error(`Missing image model factory for ${adapter.id}`);
            }

            const result = await generateImage({
                model,
                prompt: 'A tiny blue square icon on a white background, flat style.',
                size: '1024x1024',
            });

            expect(result.images.length).toBeGreaterThan(0);
            const firstImage = result.images[0];
            expect(firstImage).toBeDefined();
            expect(Boolean(firstImage?.base64) || Boolean(firstImage?.url)).toBe(
                true
            );
        },
    },
];

function assertChatUsage(usage: {
    inputTokens: number;
    outputTokens: number;
    inputTokenDetails: {
        cacheReadTokens: number;
        cacheWriteTokens: number;
    };
    outputTokenDetails: {
        reasoningTokens: number;
    };
}): void {
    expect(usage).toHaveProperty('inputTokenDetails');
    expect(usage).toHaveProperty('outputTokenDetails');
    expect(usage.inputTokenDetails).toHaveProperty('cacheReadTokens');
    expect(usage.inputTokenDetails).toHaveProperty('cacheWriteTokens');
    expect(usage.outputTokenDetails).toHaveProperty('reasoningTokens');

    expect(Number.isFinite(usage.inputTokens)).toBe(true);
    expect(Number.isFinite(usage.outputTokens)).toBe(true);
    expect(Number.isFinite(usage.inputTokenDetails.cacheReadTokens)).toBe(true);
    expect(Number.isFinite(usage.inputTokenDetails.cacheWriteTokens)).toBe(true);
    expect(Number.isFinite(usage.outputTokenDetails.reasoningTokens)).toBe(true);

    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThanOrEqual(0);
    expect(usage.inputTokenDetails.cacheReadTokens).toBeGreaterThanOrEqual(0);
    expect(usage.inputTokenDetails.cacheWriteTokens).toBeGreaterThanOrEqual(0);
    expect(usage.outputTokenDetails.reasoningTokens).toBeGreaterThanOrEqual(0);

    expect(
        usage.inputTokenDetails.cacheReadTokens +
            usage.inputTokenDetails.cacheWriteTokens
    ).toBeLessThanOrEqual(usage.inputTokens);
    expect(usage.outputTokenDetails.reasoningTokens).toBeLessThanOrEqual(
        usage.outputTokens
    );
}
