import type {
    AssistantContentPart,
    GenerateResult,
    StreamEvent,
    ChatStream,
} from './types.ts';
import { createStream } from './base-stream.ts';
import { mapStreamErrors } from './map-stream-errors.ts';

export type CreateChatStreamOptions = {
    signal?: AbortSignal;
    /**
     * Maps errors raised while opening or iterating the source — including
     * in-band SDK failures after HTTP 200 — onto typed core-ai errors.
     * Already-typed core-ai errors pass through unchanged.
     */
    mapError?: (error: unknown) => unknown;
};

export function createChatStream(
    source:
        | AsyncIterable<StreamEvent>
        | (() => Promise<AsyncIterable<StreamEvent>>),
    options: CreateChatStreamOptions = {}
): ChatStream {
    const { signal, mapError } = options;
    const resolvedSource: AsyncIterable<StreamEvent> =
        typeof source === 'function'
            ? (async function* () {
                  yield* await source();
              })()
            : source;
    const sourceWithMappedErrors = mapError
        ? mapStreamErrors(resolvedSource, mapError)
        : resolvedSource;
    const parts: AssistantContentPart[] = [];
    let textBuffer = '';
    let textMetadata: Record<string, unknown> | undefined;
    let reasoningBuffer = '';
    let reasoningMetadata: Record<string, unknown> | undefined;
    let reasoningProviderMetadata:
        | Record<string, Record<string, unknown>>
        | undefined;
    let insideText = false;
    let insideReasoning = false;
    let finishReason: GenerateResult['finishReason'] = 'unknown';
    let usage: GenerateResult['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };

    const flushText = () => {
        if (textBuffer.length === 0) {
            textMetadata = undefined;
            return;
        }
        parts.push({
            type: 'text',
            text: textBuffer,
            ...(textMetadata ? { metadata: textMetadata } : {}),
        });
        textBuffer = '';
        textMetadata = undefined;
    };

    const flushReasoning = () => {
        if (
            reasoningBuffer.length === 0 &&
            reasoningProviderMetadata === undefined
        ) {
            reasoningMetadata = undefined;
            return;
        }
        parts.push({
            type: 'reasoning',
            text: reasoningBuffer,
            ...(reasoningMetadata ? { metadata: reasoningMetadata } : {}),
            ...(reasoningProviderMetadata
                ? { providerMetadata: reasoningProviderMetadata }
                : {}),
        });
        reasoningBuffer = '';
        reasoningMetadata = undefined;
        reasoningProviderMetadata = undefined;
    };

    const startText = () => {
        if (insideReasoning) {
            flushReasoning();
            insideReasoning = false;
        }
        flushText();
        insideText = true;
    };

    const startReasoning = () => {
        flushText();
        insideText = false;
        flushReasoning();
        insideReasoning = true;
    };

    const appendReasoning = (text: string) => {
        if (!insideReasoning) {
            flushText();
            insideText = false;
            insideReasoning = true;
        }
        reasoningBuffer += text;
    };

    const endReasoning = (
        providerMetadata?: Record<string, Record<string, unknown>>,
        metadata?: Record<string, unknown>
    ) => {
        reasoningProviderMetadata = providerMetadata;
        reasoningMetadata = metadata;
        flushReasoning();
        insideReasoning = false;
    };

    const endText = (metadata?: Record<string, unknown>) => {
        textMetadata = metadata;
        flushText();
        insideText = false;
    };

    const appendText = (text: string) => {
        if (insideReasoning) {
            flushReasoning();
            insideReasoning = false;
        }
        if (!insideText) {
            insideText = true;
        }
        textBuffer += text;
    };

    const appendToolCall = (
        toolCall: Extract<StreamEvent, { type: 'tool-call-end' }>['toolCall'],
        providerMetadata?: Record<string, Record<string, unknown>>
    ) => {
        flushText();
        insideText = false;
        flushReasoning();
        insideReasoning = false;
        parts.push({
            type: 'tool-call',
            toolCall,
            ...(providerMetadata ? { providerMetadata } : {}),
        });
    };

    const setFinish = (event: Extract<StreamEvent, { type: 'finish' }>) => {
        finishReason = event.finishReason;
        usage = event.usage;
    };

    const collectFinalizedData = () => {
        const contentSegments: string[] = [];
        const reasoningSegments: string[] = [];
        const toolCalls: GenerateResult['toolCalls'] = [];

        for (const part of parts) {
            if (part.type === 'text') {
                contentSegments.push(part.text);
                continue;
            }
            if (part.type === 'reasoning') {
                reasoningSegments.push(part.text);
                continue;
            }
            if (part.type === 'tool-call') {
                toolCalls.push(part.toolCall);
            }
        }

        const content = contentSegments.join('');
        const reasoning = reasoningSegments.join('');

        return {
            content: content.length > 0 ? content : null,
            reasoning: reasoning.length > 0 ? reasoning : null,
            toolCalls,
        };
    };

    return createStream({
        source: sourceWithMappedErrors,
        signal,
        reduceEvent(event) {
            switch (event.type) {
                case 'text-start':
                    startText();
                    break;
                case 'reasoning-start':
                    startReasoning();
                    break;
                case 'reasoning-delta':
                    appendReasoning(event.text);
                    break;
                case 'reasoning-end':
                    endReasoning(event.providerMetadata, event.metadata);
                    break;
                case 'text-delta':
                    appendText(event.text);
                    break;
                case 'text-end':
                    endText(event.metadata);
                    break;
                case 'tool-call-end':
                    appendToolCall(event.toolCall, event.providerMetadata);
                    break;
                case 'finish':
                    setFinish(event);
                    break;
                default:
                    break;
            }
        },
        finalizeResult() {
            flushText();
            flushReasoning();
            const { content, reasoning, toolCalls } = collectFinalizedData();

            return {
                parts,
                content,
                reasoning,
                toolCalls,
                finishReason,
                usage,
            };
        },
    });
}
