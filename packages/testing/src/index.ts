import { z } from 'zod';

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

export type CapturingFetch = {
    fetch: (
        input: string | URL | Request,
        init?: RequestInit
    ) => Promise<Response>;
    /** Parsed JSON body of every request, in call order. */
    bodies: Record<string, unknown>[];
};

/**
 * A `fetch` for real Anthropic SDK clients: records each JSON request body
 * and answers with a Messages API stream holding one text block.
 */
export function createAnthropicCapturingFetch(text = 'ok'): CapturingFetch {
    const bodies: Record<string, unknown>[] = [];
    const fetch: CapturingFetch['fetch'] = async (_input, init) => {
        if (typeof init?.body === 'string') {
            bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        }
        return createSseResponse([
            {
                type: 'message_start',
                message: {
                    id: 'msg_test',
                    type: 'message',
                    role: 'assistant',
                    model: 'claude-test',
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 1, output_tokens: 0 },
                },
            },
            {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
            },
            {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text },
            },
            { type: 'content_block_stop', index: 0 },
            {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: 1 },
            },
            { type: 'message_stop' },
        ]);
    };
    return { fetch, bodies };
}

function createSseResponse(
    events: ({ type: string } & Record<string, unknown>)[]
): Response {
    const body = events
        .map(
            (event) =>
                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
        )
        .join('');
    return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
    });
}

/**
 * One tool with Standard Schema parameters, which core-ai validates, and one
 * with plain JSON Schema, which it does not.
 */
export function createValidationTools() {
    return {
        search: {
            name: 'search',
            description: 'Search',
            parameters: z.object({ limit: z.number() }),
        },
        lookup: {
            name: 'lookup',
            description: 'Look up a record',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
            },
        },
    };
}
