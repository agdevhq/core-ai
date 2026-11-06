import {
    CoreAIError,
    ProviderError,
    type ProviderErrorPhase,
} from './errors.ts';
import { getTransientNetworkErrorCode } from './provider-error-utils.ts';

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
 * disguised as a provider failure. The exception is a network failure:
 * `fetch` reports a connection that drops mid-stream as a `TypeError` with a
 * coded `cause`, so it is mapped like any other provider error.
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
        if (
            error instanceof CoreAIError ||
            (isLanguageError(error) &&
                getTransientNetworkErrorCode(error) === undefined)
        ) {
            throw error;
        }
        throw mapError(error);
    }
}

/**
 * Internal helper for {@link createChatStream}. Not part of the public API.
 *
 * Records on a {@link ProviderError} the phase the stream was in when it
 * failed. Status codes cannot tell this apart: some providers report one for
 * failures inside the stream too. A phase that is already set stays: stream
 * middleware can re-wrap a chat stream, and the inner one knows the real phase.
 */
export async function* setProviderErrorPhase<TEvent>(
    source: AsyncIterable<TEvent>,
    getPhase: () => ProviderErrorPhase
): AsyncIterable<TEvent> {
    try {
        for await (const event of source) {
            yield event;
        }
    } catch (error) {
        if (error instanceof ProviderError) {
            error.phase ??= getPhase();
        }
        throw error;
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
