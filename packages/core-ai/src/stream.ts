import type {
    GenerateResult,
    StreamEvent,
    StreamResult,
    ToolCall,
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
        let content = '';
        const toolCalls: ToolCall[] = [];
        let finishReason: GenerateResult['finishReason'] = 'unknown';
        let usage: GenerateResult['usage'] = {
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
        };

        for await (const event of source) {
            if (event.type === 'content-delta') {
                content += event.text;
            } else if (event.type === 'tool-call-end') {
                toolCalls.push(event.toolCall);
            } else if (event.type === 'finish') {
                finishReason = event.finishReason;
                usage = event.usage;
            }

            yield event;
        }

        resolveResponse?.({
            content: content.length > 0 ? content : null,
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
