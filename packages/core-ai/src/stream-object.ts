import type { z } from 'zod';
import { LLMError } from './errors.ts';
import type {
    ChatModel,
    GenerateObjectResult,
    ObjectStreamEvent,
    StreamObjectOptions,
    StreamObjectResult,
} from './types.ts';

export type StreamObjectParams<TSchema extends z.ZodType> =
    StreamObjectOptions<TSchema> & {
        model: ChatModel;
    };

export async function streamObject<TSchema extends z.ZodType>(
    params: StreamObjectParams<TSchema>
): Promise<StreamObjectResult<TSchema>> {
    if (params.messages.length === 0) {
        throw new LLMError('messages must not be empty');
    }

    const { model, ...options } = params;
    return model.streamObject(options);
}

export function createObjectStreamResult<TSchema extends z.ZodType>(
    source: AsyncIterable<ObjectStreamEvent<TSchema>>
): StreamObjectResult<TSchema> {
    let resolveResponse:
        | ((result: GenerateObjectResult<TSchema>) => void)
        | undefined;
    let rejectResponse: ((error: unknown) => void) | undefined;
    const responsePromise = new Promise<GenerateObjectResult<TSchema>>(
        (resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
        }
    );

    let iteratorCreated = false;

    async function* iterate(): AsyncGenerator<ObjectStreamEvent<TSchema>> {
        let objectResult: z.infer<TSchema> | undefined;
        let finishReason: GenerateObjectResult<TSchema>['finishReason'] =
            'unknown';
        let usage: GenerateObjectResult<TSchema>['usage'] = {
            inputTokens: 0,
            outputTokens: 0,
            inputTokenDetails: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            },
            outputTokenDetails: {
                reasoningTokens: 0,
            },
        };

        try {
            for await (const event of source) {
                if (event.type === 'object') {
                    objectResult = event.object;
                } else if (event.type === 'finish') {
                    finishReason = event.finishReason;
                    usage = event.usage;
                }

                yield event;
            }

            if (objectResult === undefined) {
                throw new LLMError(
                    'object stream completed without emitting a final object'
                );
            }

            resolveResponse?.({
                object: objectResult,
                finishReason,
                usage,
            });
        } catch (error) {
            rejectResponse?.(error);
            throw error;
        }
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
                    try {
                        for await (const _event of generator) {
                            // Consume the stream to build the final response.
                        }
                    } catch {
                        // The rejection is handled by rejectResponse.
                    }
                })();
            }
            return responsePromise;
        },
    };
}
