import { assertNonEmptyMessages } from './assertions.ts';
import { CoreAIError } from './errors.ts';
import { createStream } from './base-stream.ts';
import { callModelWithOptions } from './model-options.ts';
import type {
    ChatModel,
    GenerateObjectResult,
    InferSchemaOutput,
    ObjectStream,
    ObjectStreamEvent,
    SchemaInput,
    StreamObjectOptions,
} from './types.ts';

export type StreamObjectParams<TSchema extends SchemaInput> =
    StreamObjectOptions<TSchema> & {
        model: ChatModel;
    };

export async function streamObject<TSchema extends SchemaInput>(
    params: StreamObjectParams<TSchema>
): Promise<ObjectStream<TSchema>> {
    assertNonEmptyMessages(params.messages);

    return callModelWithOptions(params, (model, options) =>
        model.streamObject(options)
    );
}

export function createObjectStream<TSchema extends SchemaInput>(
    source: AsyncIterable<ObjectStreamEvent<TSchema>>,
    options: {
        signal?: AbortSignal;
    } = {}
): ObjectStream<TSchema> {
    const { signal } = options;
    let objectState:
        | { status: 'pending' }
        | { status: 'ready'; object: InferSchemaOutput<TSchema> } = {
        status: 'pending',
    };
    let finishReason: GenerateObjectResult<TSchema>['finishReason'] = 'unknown';
    let usage: GenerateObjectResult<TSchema>['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };

    return createStream({
        source,
        signal,
        reduceEvent(event) {
            if (event.type === 'object') {
                objectState = {
                    status: 'ready',
                    object: event.object,
                };
            } else if (event.type === 'finish') {
                finishReason = event.finishReason;
                usage = event.usage;
            }
        },
        finalizeResult() {
            if (objectState.status !== 'ready') {
                throw new CoreAIError(
                    'object stream completed without emitting a final object'
                );
            }

            return {
                object: objectState.object,
                finishReason,
                usage,
            };
        },
    });
}
