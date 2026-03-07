import { StreamAbortedError } from './errors.ts';

type BaseStream<TEvent, TResult> = AsyncIterable<TEvent> & {
    readonly result: Promise<TResult>;
    readonly events: Promise<readonly TEvent[]>;
};

export type CreateStreamOptions<TEvent, TResult> = {
    source: AsyncIterable<TEvent>;
    reduceEvent(event: TEvent): void;
    finalizeResult(): TResult;
    signal?: AbortSignal;
};

type TerminalState<TResult> =
    | { status: 'running' }
    | { status: 'completed'; result: TResult }
    | { status: 'rejected'; error: unknown };

export function createStream<TEvent, TResult>(
    options: CreateStreamOptions<TEvent, TResult>
): BaseStream<TEvent, TResult> {
    const { source, reduceEvent, finalizeResult, signal } = options;
    const iterator = source[Symbol.asyncIterator]();
    const bufferedEvents: TEvent[] = [];
    let terminalState: TerminalState<TResult> = { status: 'running' };
    let resolveResult: ((result: TResult) => void) | undefined;
    let rejectResult: ((error: unknown) => void) | undefined;
    let resolveEvents: ((events: readonly TEvent[]) => void) | undefined;
    const result = new Promise<TResult>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    void result.catch(() => {});
    const events = new Promise<readonly TEvent[]>((resolve) => {
        resolveEvents = resolve;
    });
    const waiters = new Set<() => void>();
    let closeSourceIteratorPromise: Promise<void> | undefined;

    function notifyWaiters(): void {
        for (const waiter of waiters) {
            waiter();
        }
        waiters.clear();
    }

    function resolveWhenUpdated(): Promise<void> {
        if (terminalState.status !== 'running') {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            waiters.add(resolve);
        });
    }

    function cleanupSignalListener(): void {
        signal?.removeEventListener('abort', abortStream);
    }

    function settleCompleted(finalResult: TResult): void {
        if (terminalState.status !== 'running') {
            return;
        }
        terminalState = {
            status: 'completed',
            result: finalResult,
        };
        cleanupSignalListener();
        resolveResult?.(finalResult);
        resolveEvents?.([...bufferedEvents]);
        notifyWaiters();
    }

    function settleRejected(error: unknown): void {
        if (terminalState.status !== 'running') {
            return;
        }
        terminalState = {
            status: 'rejected',
            error,
        };
        cleanupSignalListener();
        rejectResult?.(error);
        resolveEvents?.([...bufferedEvents]);
        notifyWaiters();
    }

    function closeSourceIterator(): Promise<void> {
        if (closeSourceIteratorPromise) {
            return closeSourceIteratorPromise;
        }

        closeSourceIteratorPromise = (async () => {
            try {
                await iterator.return?.();
            } catch {
                // Ignore cleanup failures once the stream has already settled.
            }
        })();

        return closeSourceIteratorPromise;
    }

    function abortStream(): void {
        if (terminalState.status !== 'running') {
            return;
        }
        settleRejected(new StreamAbortedError('stream aborted'));
        void closeSourceIterator();
    }

    if (signal) {
        if (signal.aborted) {
            abortStream();
        } else {
            signal.addEventListener('abort', abortStream, { once: true });
        }
    }

    async function pump(): Promise<void> {
        try {
            while (terminalState.status === 'running') {
                const next = await iterator.next();
                if (terminalState.status !== 'running') {
                    await closeSourceIterator();
                    return;
                }
                if (next.done) {
                    try {
                        settleCompleted(finalizeResult());
                    } catch (error) {
                        settleRejected(error);
                    }
                    return;
                }

                bufferedEvents.push(next.value);
                notifyWaiters();
                reduceEvent(next.value);
            }
        } catch (error) {
            settleRejected(error);
            await closeSourceIterator();
        }
    }

    void pump();

    return {
        [Symbol.asyncIterator]() {
            let index = 0;
            let closed = false;
            return {
                async next(): Promise<IteratorResult<TEvent>> {
                    if (closed) {
                        return {
                            done: true,
                            value: undefined,
                        };
                    }

                    while (!closed && index >= bufferedEvents.length) {
                        if (terminalState.status === 'completed') {
                            return {
                                done: true,
                                value: undefined,
                            };
                        }
                        if (terminalState.status === 'rejected') {
                            throw terminalState.error;
                        }
                        await resolveWhenUpdated();
                    }

                    if (closed) {
                        return {
                            done: true,
                            value: undefined,
                        };
                    }

                    const value = bufferedEvents[index]!;
                    index += 1;
                    return {
                        done: false,
                        value,
                    };
                },
                async return(): Promise<IteratorResult<TEvent>> {
                    closed = true;
                    notifyWaiters();
                    return {
                        done: true,
                        value: undefined,
                    };
                },
            };
        },
        result,
        events,
    };
}
