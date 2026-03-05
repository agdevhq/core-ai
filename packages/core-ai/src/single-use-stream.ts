type SingleUseStreamResult<TEvent, TResult> = AsyncIterable<TEvent> & {
    toResponse(): Promise<TResult>;
};

export type CreateSingleUseStreamResultOptions<TEvent, TResult> = {
    generator: AsyncGenerator<TEvent>;
    responsePromise: Promise<TResult>;
    onAutoConsumeError?: (error: unknown) => void;
};

export function createSingleUseStreamResult<TEvent, TResult>(
    options: CreateSingleUseStreamResultOptions<TEvent, TResult>
): SingleUseStreamResult<TEvent, TResult> {
    const { generator, responsePromise, onAutoConsumeError } = options;
    let iteratorCreated = false;

    const consumeStream = () => {
        if (!onAutoConsumeError) {
            (async () => {
                for await (const _event of generator) {
                    // Consume the stream to build the final response.
                }
            })();
            return;
        }

        (async () => {
            try {
                for await (const _event of generator) {
                    // Consume the stream to build the final response.
                }
            } catch (error) {
                onAutoConsumeError(error);
            }
        })();
    };

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
                consumeStream();
            }
            return responsePromise;
        },
    };
}
