import { CoreAIError } from './errors.ts';

/**
 * Internal helper for {@link createChatStream}. Not part of the public API.
 *
 * Re-throws errors raised while iterating a provider SDK stream through
 * `mapError`, so in-band failures (a request accepted with HTTP 200 whose
 * stream then delivers an error event) surface as the same typed core-ai
 * errors as failures of the initial request.
 *
 * Errors that already are {@link CoreAIError} instances pass through untouched.
 * Language errors (`TypeError`, `RangeError`, `SyntaxError`,
 * `ReferenceError`) also pass through so a bug in event mapping is not
 * disguised as a provider failure.
 */
export async function* mapStreamErrors<TEvent>(
    source: AsyncIterable<TEvent>,
    mapError: (error: unknown) => CoreAIError
): AsyncIterable<TEvent> {
    try {
        for await (const event of source) {
            yield event;
        }
    } catch (error) {
        if (error instanceof CoreAIError || isLanguageError(error)) {
            throw error;
        }
        throw mapError(error);
    }
}

function isLanguageError(error: unknown): boolean {
    return (
        error instanceof TypeError ||
        error instanceof RangeError ||
        error instanceof SyntaxError ||
        error instanceof ReferenceError
    );
}
