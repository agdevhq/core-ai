import type { z } from 'zod';
import { assertNonEmptyMessages } from './assertions.ts';
import { LLMError } from './errors.ts';
import { createSingleUseStreamResult } from './single-use-stream.ts';
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
    assertNonEmptyMessages(params.messages);

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
            outputTokenDetails: {},
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
    return createSingleUseStreamResult({
        generator,
        responsePromise,
        onAutoConsumeError: () => {
            // The rejection is handled by rejectResponse.
        },
    });
}
