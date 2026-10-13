import { ValidationError } from './errors.ts';
import { isPlainObject } from './json-schema.ts';
import { isStandardSchema } from './schema.ts';
import type {
    AssistantContentPart,
    AssistantMessage,
    GenerateOptions,
    JsonSchema,
    Message,
    ModelCapabilities,
    SystemMessage,
    ToolCallPart,
    ToolDefinition,
    ToolDiscoveryCallPart,
    ToolDiscoveryOptions,
    ToolDiscoveryResultMessage,
    ToolResultMessage,
    ToolSet,
    ToolSnapshot,
    UserMessage,
} from './types.ts';

/** Provider-facing name of the discovery tool core-ai injects. */
export const TOOL_DISCOVERY_TOOL_NAME = 'core_ai_discover_tools';

/**
 * Name of the deferred tool that keeps Anthropic's deferred tool loading
 * active for a whole conversation (see `@core-ai/anthropic`).
 */
export const TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME =
    'core_ai_deferred_tools_placeholder';

const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set([
    TOOL_DISCOVERY_TOOL_NAME,
    TOOL_DISCOVERY_PLACEHOLDER_TOOL_NAME,
]);

const TOOL_DISCOVERY_DESCRIPTION =
    'Discovers tools that are not available yet. Call it when none of your ' +
    'tools fits the task. Pass the exact tool names in `names` when you know ' +
    'them, or describe the capability you need in `query`. Discovered tools ' +
    'can be called by their own names from your next step on.';

const TOOL_DISCOVERY_PARAMETERS: JsonSchema = Object.freeze({
    type: 'object',
    properties: {
        names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact names of the tools to discover.',
        },
        query: {
            type: 'string',
            description: 'Keywords describing the capability you need.',
        },
    },
    additionalProperties: false,
});

const EMPTY_DISCOVERY_RESULT_TEXT = 'No matching tools were found.';

/**
 * How a request renders tool discovery, decided per request from the neutral
 * messages, so a history produced under one mode renders under the other.
 */
export type ResolvedToolDiscovery = (
    | {
          /**
           * The request sets `toolDiscovery`, the model supports it
           * natively, and the provider options do not force emulation.
           */
          rendering: 'native';
          discoveryTool: ToolSnapshot;
      }
    | {
          rendering: 'emulated';
          /** The discovery tool, when the request sets `toolDiscovery`. */
          discoveryTool?: ToolSnapshot;
      }
) & {
    /**
     * The discovered tools to declare: the latest snapshot of each name, in
     * order of first discovery, without names the caller's `tools` declare
     * (the caller's definition wins).
     */
    discoveredTools: ToolSnapshot[];
};

export type ResolveToolDiscoveryOptions = {
    capabilities: ModelCapabilities;
    providerId: string;
    /** Forces emulation, e.g. from a provider option. */
    emulate?: boolean;
};

/**
 * Validates the tool discovery parts of a request and resolves how to render
 * them. Throws a `ValidationError` before any provider call for reserved
 * tool names, unanswered discovery calls, discovery results without a call,
 * snapshots whose `parameters` are not plain JSON Schema, and a `toolChoice`
 * that names a tool outside `tools`. Without discovery parts or
 * `toolDiscovery`, nothing is checked.
 */
export function resolveToolDiscovery(
    options: Pick<
        GenerateOptions,
        'messages' | 'tools' | 'toolChoice' | 'toolDiscovery'
    >,
    { capabilities, providerId, emulate = false }: ResolveToolDiscoveryOptions
): ResolvedToolDiscovery {
    const discoveryTool =
        options.toolDiscovery === undefined
            ? undefined
            : getToolDiscoveryTool(options.toolDiscovery);
    const snapshots = getDiscoveredToolSnapshots(options.messages, providerId);
    if (discoveryTool === undefined && snapshots === undefined) {
        return { rendering: 'emulated', discoveredTools: [] };
    }

    const callerToolNames = new Set(
        Object.values(options.tools ?? {}).map((tool) => tool.name)
    );
    for (const name of callerToolNames) {
        assertNotReserved(name, 'tool', providerId);
    }

    const discoveredTools = [...(snapshots ?? new Map()).values()].filter(
        (tool) => !callerToolNames.has(tool.name)
    );
    validateToolChoice(options.toolChoice, callerToolNames, providerId);

    return discoveryTool !== undefined &&
        capabilities.tools.toolDiscovery === 'native' &&
        !emulate
        ? { rendering: 'native', discoveryTool, discoveredTools }
        : { rendering: 'emulated', discoveryTool, discoveredTools };
}

function getToolDiscoveryTool(options: ToolDiscoveryOptions): ToolSnapshot {
    const appended = options.description?.trim();
    return {
        name: TOOL_DISCOVERY_TOOL_NAME,
        description: appended
            ? `${TOOL_DISCOVERY_DESCRIPTION}\n\n${appended}`
            : TOOL_DISCOVERY_DESCRIPTION,
        parameters: TOOL_DISCOVERY_PARAMETERS,
    };
}

/**
 * The tools an emulating adapter declares: the caller's tools, then the
 * discovery tool, then the discovered tools. Returns `tools` itself when
 * there is nothing to add.
 */
export function getEmulatedToolSet(
    tools: ToolSet | undefined,
    discovery: ResolvedToolDiscovery
): ToolSet | undefined {
    const added = [
        ...(discovery.discoveryTool ? [discovery.discoveryTool] : []),
        ...discovery.discoveredTools,
    ];
    if (added.length === 0) {
        return tools;
    }

    const toolSet: ToolSet = { ...tools };
    for (const tool of added) {
        // Keys are never sent; they only need to stay unique next to the
        // caller's keys, which may differ from their tools' names.
        let key = tool.name;
        while (Object.hasOwn(toolSet, key)) {
            key = `${key}_`;
        }
        toolSet[key] = tool;
    }
    return toolSet;
}

/** A message after emulation: no discovery calls or discovery results. */
export type EmulatedMessage =
    | SystemMessage
    | UserMessage
    | EmulatedAssistantMessage
    | ToolResultMessage;

export type EmulatedAssistantMessage = Omit<AssistantMessage, 'parts'> & {
    parts: Exclude<AssistantContentPart, ToolDiscoveryCallPart>[];
};

/**
 * Rewrites discovery calls into calls to the discovery tool and discovery
 * results into text tool results, as emulating adapters send them. Messages
 * without discovery parts are returned unchanged.
 */
export function emulateToolDiscoveryMessages(
    messages: readonly Message[]
): EmulatedMessage[] {
    return messages.map((message) => {
        if (message.role === 'tool-discovery') {
            return toToolDiscoveryToolResult(message);
        }
        if (message.role !== 'assistant') {
            return message;
        }
        return {
            ...message,
            parts: message.parts.map((part) =>
                part.type === 'tool-discovery-call'
                    ? toToolDiscoveryToolCall(part)
                    : part
            ),
        };
    });
}

/** A discovery call as a call to the discovery tool. */
export function toToolDiscoveryToolCall(
    part: ToolDiscoveryCallPart
): ToolCallPart {
    return {
        type: 'tool-call',
        toolCall: {
            id: part.id,
            name: TOOL_DISCOVERY_TOOL_NAME,
            arguments: getToolDiscoveryArguments(part),
        },
        ...(part.providerMetadata
            ? { providerMetadata: part.providerMetadata }
            : {}),
    };
}

/** A discovery result as a text tool result. */
export function toToolDiscoveryToolResult(
    message: ToolDiscoveryResultMessage
): ToolResultMessage {
    return {
        role: 'tool',
        toolCallId: message.callId,
        content: getToolDiscoveryResultText(message),
    };
}

/** The discovery tool arguments of a discovery call, as the model sends them. */
export function getToolDiscoveryArguments(
    part: Pick<ToolDiscoveryCallPart, 'names' | 'query'>
): Record<string, unknown> {
    return {
        ...(part.names !== undefined ? { names: part.names } : {}),
        ...(part.query !== undefined ? { query: part.query } : {}),
    };
}

/**
 * Reads a discovery call from the discovery tool's arguments. Malformed
 * fields are dropped; a single name is accepted in place of a list.
 */
export function createToolDiscoveryCallPart(
    id: string,
    args: unknown,
    providerMetadata?: Record<string, Record<string, unknown>>
): ToolDiscoveryCallPart {
    const input = isPlainObject(args) ? args : {};
    const names: unknown =
        typeof input.names === 'string' ? [input.names] : input.names;
    const validNames = Array.isArray(names)
        ? names.filter((name): name is string => typeof name === 'string')
        : [];

    return {
        type: 'tool-discovery-call',
        id,
        ...(validNames.length > 0 ? { names: validNames } : {}),
        ...(typeof input.query === 'string' && input.query.length > 0
            ? { query: input.query }
            : {}),
        ...(providerMetadata ? { providerMetadata } : {}),
    };
}

/**
 * The text of a discovery result where it is rendered as text: every
 * emulated result, and empty results natively.
 */
export function getToolDiscoveryResultText(
    message: Pick<ToolDiscoveryResultMessage, 'tools' | 'note'>
): string {
    const note = message.note?.trim() ? message.note : undefined;
    if (message.tools.length === 0) {
        return note ?? EMPTY_DISCOVERY_RESULT_TEXT;
    }

    const names = message.tools.map((tool) => tool.name).join(', ');
    const text = `Discovered tools: ${names}. You can call them now.`;
    return note ? `${text}\n\n${note}` : text;
}

/**
 * The latest snapshot of every discovered tool, keyed by name in order of
 * first discovery, after validating the discovery parts of `messages`.
 * Returns `undefined` when the messages contain no discovery parts.
 */
function getDiscoveredToolSnapshots(
    messages: readonly Message[],
    providerId: string
): Map<string, ToolSnapshot> | undefined {
    const pendingCallIds = new Set<string>();
    const answeredCallIds = new Set<string>();
    let snapshots: Map<string, ToolSnapshot> | undefined;

    for (const message of messages) {
        if (message.role === 'assistant') {
            for (const part of message.parts) {
                if (part.type === 'tool-discovery-call') {
                    snapshots ??= new Map();
                    pendingCallIds.add(part.id);
                }
            }
            continue;
        }

        if (message.role !== 'tool-discovery') {
            continue;
        }

        snapshots ??= new Map();
        if (answeredCallIds.has(message.callId)) {
            throw new ValidationError(
                `Discovery call "${message.callId}" is answered by more than one tool-discovery message; answer each discovery call exactly once.`,
                undefined,
                providerId
            );
        }
        if (!pendingCallIds.delete(message.callId)) {
            throw new ValidationError(
                `The tool-discovery message for "${message.callId}" does not answer a preceding tool-discovery-call part.`,
                undefined,
                providerId
            );
        }
        answeredCallIds.add(message.callId);

        for (const tool of message.tools) {
            validateSnapshot(tool, message.callId, providerId);
            // Replacing a value keeps the key's first insertion position:
            // order of first discovery, latest snapshot.
            snapshots.set(tool.name, tool);
        }
    }

    const [unanswered] = pendingCallIds;
    if (unanswered !== undefined) {
        throw new ValidationError(
            `Discovery call "${unanswered}" has no tool-discovery message answering it. Answer every discovery call before the next request.`,
            undefined,
            providerId
        );
    }

    return snapshots;
}

function validateSnapshot(
    tool: ToolDefinition,
    callId: string,
    providerId: string
): void {
    assertNotReserved(tool.name, 'discovered tool', providerId);
    if (!isPlainObject(tool.parameters) || isStandardSchema(tool.parameters)) {
        throw new ValidationError(
            `Discovered tool "${tool.name}" (discovery call "${callId}") must have plain JSON Schema parameters; convert schema objects with toJsonSchema().`,
            undefined,
            providerId
        );
    }
}

function validateToolChoice(
    toolChoice: GenerateOptions['toolChoice'],
    callerToolNames: ReadonlySet<string>,
    providerId: string
): void {
    if (
        typeof toolChoice === 'object' &&
        !callerToolNames.has(toolChoice.toolName)
    ) {
        throw new ValidationError(
            `toolChoice names "${toolChoice.toolName}", which is not one of the request's tools; with tool discovery, toolChoice may only name tools in \`tools\`.`,
            undefined,
            providerId
        );
    }
}

function assertNotReserved(
    name: string,
    kind: string,
    providerId: string
): void {
    if (RESERVED_TOOL_NAMES.has(name)) {
        throw new ValidationError(
            `The ${kind} name "${name}" is reserved for core-ai's tool discovery.`,
            undefined,
            providerId
        );
    }
}
