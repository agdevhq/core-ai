import { describe, expect, it, vi } from 'vitest';
import { toAsyncIterable } from '@core-ai/testing';
import { ProviderError, RateLimitError } from './errors.ts';
import { mapStreamErrors } from './map-stream-errors.ts';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of iterable) {
        items.push(item);
    }
    return items;
}

async function* failAfter<T>(items: T[], error: unknown): AsyncIterable<T> {
    yield* toAsyncIterable(items);
    throw error;
}

describe('mapStreamErrors', () => {
    it('passes events through untouched', async () => {
        const mapError = vi.fn();

        await expect(
            collect(mapStreamErrors(toAsyncIterable([1, 2, 3]), mapError))
        ).resolves.toEqual([1, 2, 3]);
        expect(mapError).not.toHaveBeenCalled();
    });

    it('maps errors raised mid-stream after yielding earlier events', async () => {
        const sdkError = Object.assign(new Error('rate limited'), {
            code: 'rate_limit_exceeded',
        });
        const mapped = mapStreamErrors(failAfter(['a', 'b'], sdkError), (error) =>
            new RateLimitError('rate limited', 'openai', { cause: error })
        );
        const received: string[] = [];

        await expect(
            (async () => {
                for await (const item of mapped) {
                    received.push(item);
                }
            })()
        ).rejects.toMatchObject({
            name: 'RateLimitError',
            cause: sdkError,
        });
        expect(received).toEqual(['a', 'b']);
    });

    it('does not re-map errors that already are core-ai errors', async () => {
        const typed = new ProviderError('already typed', 'openai');
        const mapError = vi.fn(
            (error: unknown) =>
                new ProviderError('remapped', 'openai', { cause: error })
        );

        await expect(
            collect(mapStreamErrors(failAfter([], typed), mapError))
        ).rejects.toBe(typed);
        expect(mapError).not.toHaveBeenCalled();
    });

    it.each([
        new TypeError('cannot read property of undefined'),
        new RangeError('invalid length'),
        new SyntaxError('unexpected token'),
        new ReferenceError('x is not defined'),
    ])('does not map $name', async (programmingError) => {
        const mapError = vi.fn();

        await expect(
            collect(mapStreamErrors(failAfter([], programmingError), mapError))
        ).rejects.toBe(programmingError);
        expect(mapError).not.toHaveBeenCalled();
    });
});
