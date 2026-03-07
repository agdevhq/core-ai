import type {
    AssistantContentPart,
    GenerateResult,
    StreamEvent,
    ChatStream,
} from './types.ts';
import { createStream } from './base-stream.ts';

export function createChatStream(
    source:
        | AsyncIterable<StreamEvent>
        | (() => Promise<AsyncIterable<StreamEvent>>),
    options: {
        signal?: AbortSignal;
    } = {}
): ChatStream {
    const { signal } = options;
    const resolvedSource: AsyncIterable<StreamEvent> =
        typeof source === 'function'
            ? (async function* () {
                  yield* await source();
              })()
            : source;
    const parts: AssistantContentPart[] = [];
    let textBuffer = '';
    let reasoningBuffer = '';
    let reasoningProviderMetadata:
        | Record<string, Record<string, unknown>>
        | undefined;
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
            return;
        }
        parts.push({
            type: 'text',
            text: textBuffer,
        });
        textBuffer = '';
    };

    const flushReasoning = () => {
        if (
            reasoningBuffer.length === 0 &&
            reasoningProviderMetadata === undefined
        ) {
            return;
        }
        parts.push({
            type: 'reasoning',
            text: reasoningBuffer,
            ...(reasoningProviderMetadata
                ? { providerMetadata: reasoningProviderMetadata }
                : {}),
        });
        reasoningBuffer = '';
        reasoningProviderMetadata = undefined;
    };

    return createStream({
        source: resolvedSource,
        signal,
        reduceEvent(event) {
            if (event.type === 'reasoning-start') {
                flushText();
                flushReasoning();
                insideReasoning = true;
            } else if (event.type === 'reasoning-delta') {
                if (!insideReasoning) {
                    flushText();
                    insideReasoning = true;
                }
                reasoningBuffer += event.text;
            } else if (event.type === 'reasoning-end') {
                reasoningProviderMetadata = event.providerMetadata;
                flushReasoning();
                insideReasoning = false;
            } else if (event.type === 'text-delta') {
                if (insideReasoning) {
                    flushReasoning();
                    insideReasoning = false;
                }
                textBuffer += event.text;
            } else if (event.type === 'tool-call-end') {
                flushText();
                flushReasoning();
                insideReasoning = false;
                parts.push({
                    type: 'tool-call',
                    toolCall: event.toolCall,
                });
            } else if (event.type === 'finish') {
                finishReason = event.finishReason;
                usage = event.usage;
            }
        },
        finalizeResult() {
            flushText();
            flushReasoning();

            const content = parts
                .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                .join('');
            const reasoning = parts
                .flatMap((part) =>
                    part.type === 'reasoning' ? [part.text] : []
                )
                .join('');
            const toolCalls = parts.flatMap((part) =>
                part.type === 'tool-call' ? [part.toolCall] : []
            );

            return {
                parts,
                content: content.length > 0 ? content : null,
                reasoning: reasoning.length > 0 ? reasoning : null,
                toolCalls,
                finishReason,
                usage,
            };
        },
    });
}
