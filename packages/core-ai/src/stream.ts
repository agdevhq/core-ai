import type {
    AssistantContentPart,
    GenerateResult,
    StreamEvent,
    StreamResult,
} from './types.ts';

export function createStreamResult(
    source: AsyncIterable<StreamEvent>
): StreamResult {
    let resolveResponse: ((result: GenerateResult) => void) | undefined;
    const responsePromise = new Promise<GenerateResult>((resolve) => {
        resolveResponse = resolve;
    });

    let iteratorCreated = false;

    async function* iterate(): AsyncGenerator<StreamEvent> {
        const parts: AssistantContentPart[] = [];
        let textBuffer = '';
        let reasoningBuffer = '';
        let reasoningProviderMetadata: Record<string, Record<string, unknown>> | undefined;
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

        for await (const event of source) {
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

            yield event;
        }

        flushText();
        flushReasoning();

        const content = parts
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('');
        const reasoning = parts
            .flatMap((part) => (part.type === 'reasoning' ? [part.text] : []))
            .join('');
        const toolCalls = parts.flatMap((part) =>
            part.type === 'tool-call' ? [part.toolCall] : []
        );

        resolveResponse?.({
            parts,
            content: content.length > 0 ? content : null,
            reasoning: reasoning.length > 0 ? reasoning : null,
            toolCalls,
            finishReason,
            usage,
        });
    }

    const generator = iterate();

    return {
        [Symbol.asyncIterator]() {
            if (iteratorCreated) {
                throw new Error('Stream can only be iterated once');
            }
            iteratorCreated = true;
            return generator;
        },
        toResponse() {
            if (!iteratorCreated) {
                iteratorCreated = true;
                (async () => {
                    for await (const _event of generator) {
                        // Consume the stream to build the final response.
                    }
                })();
            }
            return responsePromise;
        },
    };
}
