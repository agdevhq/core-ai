export async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
        yield item;
    }
}

type PushableEntry<T> =
    | { type: 'value'; value: T }
    | { type: 'finish' }
    | { type: 'error'; error: unknown };

export function createPushableAsyncIterable<T>(): {
    iterable: AsyncIterable<T>;
    push(value: T): void;
    finish(): void;
    fail(error: unknown): void;
} {
    const queue: PushableEntry<T>[] = [];
    let resolveNext: ((entry: PushableEntry<T>) => void) | undefined;

    function enqueue(entry: PushableEntry<T>): void {
        if (resolveNext) {
            const resolve = resolveNext;
            resolveNext = undefined;
            resolve(entry);
            return;
        }
        queue.push(entry);
    }

    return {
        iterable: {
            async *[Symbol.asyncIterator]() {
                while (true) {
                    const entry =
                        queue.shift() ??
                        (await new Promise<PushableEntry<T>>((resolve) => {
                            resolveNext = resolve;
                        }));

                    if (entry.type === 'value') {
                        yield entry.value;
                        continue;
                    }

                    if (entry.type === 'finish') {
                        return;
                    }

                    throw entry.error;
                }
            },
        },
        push(value) {
            enqueue({ type: 'value', value });
        },
        finish() {
            enqueue({ type: 'finish' });
        },
        fail(error) {
            enqueue({ type: 'error', error });
        },
    };
}
