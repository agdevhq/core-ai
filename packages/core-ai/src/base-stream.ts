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
    const events = new Promise<readonly TEvent[]>((resolve) => {
        resolveEvents = resolve;
    });
    const waiters = new Set<() => void>();

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

    function settleCompleted(finalResult: TResult): void {
        if (terminalState.status !== 'running') {
            return;
        }
        terminalState = {
            status: 'completed',
            result: finalResult,
        };
        resolveResult?.(finalResult);
        resolveEvents?.(bufferedEvents);
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
        rejectResult?.(error);
        resolveEvents?.(bufferedEvents);
        notifyWaiters();
    }

    async function closeSourceIterator(): Promise<void> {
        try {
            await iterator.return?.();
        } catch {
            // Ignore cleanup failures once the stream has already settled.
        }
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
            signal.addEventListener(
                'abort',
                () => {
                    abortStream();
                },
                { once: true }
            );
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
        }
    }

    void pump();

    return {
        [Symbol.asyncIterator]() {
            let index = 0;
            return {
                async next(): Promise<IteratorResult<TEvent>> {
                    while (index >= bufferedEvents.length) {
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

                    const value = bufferedEvents[index]!;
                    index += 1;
                    return {
                        done: false,
                        value,
                    };
                },
                async return(): Promise<IteratorResult<TEvent>> {
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
