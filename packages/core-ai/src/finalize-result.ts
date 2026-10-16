import {
    createToolDiscoveryCallPart,
    TOOL_DISCOVERY_TOOL_NAME,
} from './tool-discovery.ts';
import type {
    AssistantContentPart,
    GenerateOptions,
    GenerateResult,
    StreamEvent,
    ToolCall,
    ToolDiscoveryCall,
} from './types.ts';

/** The parts of a request that shape how its response is finalized. */
export type FinalizeResultRequest = Pick<GenerateOptions, 'toolDiscovery'>;

/**
 * With `toolDiscovery`, turns calls to the discovery tool into
 * `ToolDiscoveryCallPart`s, moves them from `toolCalls` to `discoveryCalls`,
 * and lists native discovery calls in `discoveryCalls` too. Adapters that
 * build a `GenerateResult` themselves call this before returning it;
 * streamed results get the same treatment from `createChatStream`.
 */
export function finalizeGenerateResult(
    result: GenerateResult,
    request: FinalizeResultRequest
): GenerateResult {
    if (request.toolDiscovery === undefined) {
        return result;
    }

    const parts = result.parts.map((part) =>
        part.type === 'tool-call' && isDiscoveryToolCall(part.toolCall)
            ? createToolDiscoveryCallPart(
                  part.toolCall.id,
                  part.toolCall.arguments,
                  part.providerMetadata
              )
            : part
    );
    return {
        ...result,
        parts,
        toolCalls: result.toolCalls.filter(
            (toolCall) => !isDiscoveryToolCall(toolCall)
        ),
        discoveryCalls: getDiscoveryCalls(parts),
    };
}

/** The discovery calls among `parts`, in order. */
function getDiscoveryCalls(
    parts: readonly AssistantContentPart[]
): ToolDiscoveryCall[] {
    return parts.flatMap((part) =>
        part.type === 'tool-discovery-call' ? [part.discoveryCall] : []
    );
}

/**
 * The streaming counterpart of {@link finalizeGenerateResult}. A call to the
 * discovery tool streams as a single `tool-discovery-call` event when it
 * completes, without start or delta events.
 */
export async function* finalizeStreamEvents(
    events: AsyncIterable<StreamEvent>,
    request: FinalizeResultRequest
): AsyncIterable<StreamEvent> {
    if (request.toolDiscovery === undefined) {
        yield* events;
        return;
    }

    const discoveryCallIds = new Set<string>();
    for await (const event of events) {
        if (
            event.type === 'tool-call-start' &&
            event.toolName === TOOL_DISCOVERY_TOOL_NAME
        ) {
            discoveryCallIds.add(event.toolCallId);
            continue;
        }
        if (
            event.type === 'tool-call-delta' &&
            discoveryCallIds.has(event.toolCallId)
        ) {
            continue;
        }
        if (
            event.type === 'tool-call-end' &&
            isDiscoveryToolCall(event.toolCall)
        ) {
            yield createToolDiscoveryCallPart(
                event.toolCall.id,
                event.toolCall.arguments,
                event.providerMetadata
            );
            continue;
        }
        yield event;
    }
}

function isDiscoveryToolCall(toolCall: ToolCall): boolean {
    return toolCall.name === TOOL_DISCOVERY_TOOL_NAME;
}
