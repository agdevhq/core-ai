import { ValidationError } from './errors.ts';
import { isPlainObject } from './json-schema.ts';
import { getToolJsonSchema, isStandardSchema } from './schema.ts';
import {
    assertStrictToolSchemaContract,
    countUnionParameters,
} from './validate-tool-schema-strictness.ts';
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
    ToolDiscoveryCall,
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
 * Tool names every provider accepts (live-verified: OpenAI and Anthropic
 * allow only these characters, Gemini requires a leading letter or
 * underscore, and OpenAI, Anthropic, and Gemini allow at most 128
 * characters). Discovered tools stay declared while their results are in the
 * history, so a name outside it would fail every later request on some
 * provider.
 */
const PORTABLE_TOOL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]{0,127}$/;

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
     * (the caller's definition wins). Snapshots beyond the model's strict
     * support are declared without `strict`.
     */
    discoveredTools: ToolSnapshot[];
};

export type ResolveToolDiscoveryOptions = {
    capabilities: ModelCapabilities;
    providerId: string;
    modelId: string;
    /** Forces emulation, e.g. from a provider option. */
    emulate?: boolean;
};

/**
 * Validates the tool discovery parts of a request and resolves how to render
 * them. Without discovery parts or `toolDiscovery`, nothing is checked.
 *
 * Throws a `ValidationError` before any provider call for reserved tool
 * names, snapshots whose name some provider rejects or whose `parameters`
 * are not plain JSON Schema, a `toolChoice` that names a tool outside
 * `tools`, and discovery calls and results that do not pair up within their
 * step (see {@link validateToolDiscoveryMessages}). Throws a
 * `ToolSchemaStrictnessError` for a declared strict snapshot outside the
 * strict-capable schema contract, on every model, so a history fails the
 * same way wherever it is sent.
 */
export function resolveToolDiscovery(
    options: Pick<
        GenerateOptions,
        'messages' | 'tools' | 'toolChoice' | 'toolDiscovery'
    >,
    {
        capabilities,
        providerId,
        modelId,
        emulate = false,
    }: ResolveToolDiscoveryOptions
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

    const declaredSnapshots = [...(snapshots ?? new Map()).values()].filter(
        (tool) => !callerToolNames.has(tool.name)
    );
    assertStrictToolSchemaContract(
        declaredSnapshots.filter((tool) => tool.strict === true),
        { providerId, modelId }
    );
    const discoveredTools = limitStrictSnapshots(
        declaredSnapshots,
        options.tools,
        capabilities
    );
    validateToolChoice(options.toolChoice, callerToolNames, providerId);

    return discoveryTool !== undefined &&
        capabilities.tools.toolDiscovery === 'native' &&
        !emulate
        ? { rendering: 'native', discoveryTool, discoveredTools }
        : { rendering: 'emulated', discoveryTool, discoveredTools };
}

/**
 * Snapshots stay declared while their results are in the history, so a
 * strict snapshot the model cannot take would fail every later request.
 * Discovered tools beyond the model's strict support lose `strict` instead:
 * the caller's strict tools count first against `maxStrictTools` and
 * `maxUnionParameters`, then each discovered tool, in declared order, keeps
 * `strict` while it still fits both. Without `strict` the provider stops
 * enforcing the schema; the tool is otherwise unchanged.
 */
function limitStrictSnapshots(
    discoveredTools: readonly ToolSnapshot[],
    callerTools: ToolSet | undefined,
    capabilities: ModelCapabilities
): ToolSnapshot[] {
    const { strictSchemas } = capabilities.tools;
    if (!strictSchemas.supported) {
        return discoveredTools.map(withoutStrict);
    }

    const callerStrictTools = Object.values(callerTools ?? {}).filter(
        (tool) => tool.strict === true
    );
    const { maxStrictTools = Infinity, maxUnionParameters } = strictSchemas;
    let availableTools = maxStrictTools - callerStrictTools.length;
    let availableUnionParameters =
        maxUnionParameters === undefined
            ? Infinity
            : maxUnionParameters -
              callerStrictTools.reduce(
                  (total, tool) =>
                      total + countUnionParameters(getToolJsonSchema(tool)),
                  0
              );

    return discoveredTools.map((tool) => {
        if (tool.strict !== true) {
            return tool;
        }
        const unionParameters =
            maxUnionParameters === undefined
                ? 0
                : countUnionParameters(tool.parameters);
        if (availableTools > 0 && unionParameters <= availableUnionParameters) {
            availableTools -= 1;
            availableUnionParameters -= unionParameters;
            return tool;
        }
        return withoutStrict(tool);
    });
}

function withoutStrict(tool: ToolSnapshot): ToolSnapshot {
    if (tool.strict !== true) {
        return tool;
    }
    const { strict: _strict, ...nonStrictTool } = tool;
    return nonStrictTool;
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
            id: part.discoveryCall.id,
            name: TOOL_DISCOVERY_TOOL_NAME,
            arguments: getToolDiscoveryArguments(part.discoveryCall),
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
        toolCallId: message.discoveryCallId,
        content: getToolDiscoveryResultText(message),
        ...(message.providerOptions
            ? { providerOptions: message.providerOptions }
            : {}),
    };
}

/** The discovery tool arguments of a discovery call, as the model sends them. */
export function getToolDiscoveryArguments(
    call: Pick<ToolDiscoveryCall, 'names' | 'query'>
): Record<string, unknown> {
    return {
        ...(call.names !== undefined ? { names: call.names } : {}),
        ...(call.query !== undefined ? { query: call.query } : {}),
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
        discoveryCall: {
            id,
            ...(validNames.length > 0 ? { names: validNames } : {}),
            ...(typeof input.query === 'string' && input.query.length > 0
                ? { query: input.query }
                : {}),
        },
        ...(providerMetadata ? { providerMetadata } : {}),
    };
}

/**
 * The text of a discovery result where it is rendered as text: every
 * emulated result, and empty results natively. An empty result says why with
 * its note, or else that nothing was found.
 */
export function getToolDiscoveryResultText(
    message: Pick<ToolDiscoveryResultMessage, 'tools' | 'note'>
): string {
    if (message.tools.length === 0) {
        return getToolDiscoveryNote(message) ?? EMPTY_DISCOVERY_RESULT_TEXT;
    }

    const names = message.tools.map((tool) => tool.name).join(', ');
    return `Discovered tools: ${names}. You can call them now.`;
}

/** The note of a discovery result, unless it is empty or whitespace. */
export function getToolDiscoveryNote(
    message: Pick<ToolDiscoveryResultMessage, 'note'>
): string | undefined {
    return message.note?.trim() ? message.note : undefined;
}

/**
 * Validates the discovery calls and results of `messages` as
 * {@link resolveToolDiscovery} does, for requests that send them without
 * declaring discovered tools, such as structured output. Calls pair with
 * their results per step: a tool-discovery message answers a call of the
 * preceding assistant message, every call is answered before the next user
 * or assistant message, and call ids are unique within a message.
 */
export function validateToolDiscoveryMessages(
    messages: readonly Message[],
    providerId: string
): void {
    getDiscoveredToolSnapshots(messages, providerId);
}

/**
 * The latest snapshot of every discovered tool, keyed by name in order of
 * first discovery, after validating the discovery parts of `messages`.
 * Returns `undefined` when the messages contain no discovery parts. Pairing
 * is per step, so ids only need to be unique within a message: some
 * providers reuse generated ids across steps.
 */
function getDiscoveredToolSnapshots(
    messages: readonly Message[],
    providerId: string
): Map<string, ToolSnapshot> | undefined {
    // Discovery calls of the latest assistant message, and those of them
    // that are not answered yet.
    let stepCallIds = new Set<string>();
    let pendingCallIds = new Set<string>();
    let snapshots: Map<string, ToolSnapshot> | undefined;

    const assertStepAnswered = () => {
        const [unanswered] = pendingCallIds;
        if (unanswered !== undefined) {
            throw new ValidationError(
                `Discovery call "${unanswered}" has no tool-discovery message answering it. Answer every discovery call after its assistant message, before the next user or assistant message.`,
                undefined,
                providerId
            );
        }
    };

    for (const message of messages) {
        if (message.role === 'user' || message.role === 'assistant') {
            assertStepAnswered();
            stepCallIds = new Set();
            pendingCallIds = new Set();
        }

        if (message.role === 'assistant') {
            const toolCallIds = new Set(
                message.parts.flatMap((part) =>
                    part.type === 'tool-call' ? [part.toolCall.id] : []
                )
            );
            for (const part of message.parts) {
                if (part.type !== 'tool-discovery-call') {
                    continue;
                }
                const { id } = part.discoveryCall;
                if (stepCallIds.has(id) || toolCallIds.has(id)) {
                    throw new ValidationError(
                        `Discovery call "${id}" shares its id with another call of the same assistant message; call ids must be unique within a message.`,
                        undefined,
                        providerId
                    );
                }
                snapshots ??= new Map();
                stepCallIds.add(id);
                pendingCallIds.add(id);
            }
            continue;
        }

        if (message.role !== 'tool-discovery') {
            continue;
        }

        snapshots ??= new Map();
        if (!pendingCallIds.delete(message.discoveryCallId)) {
            throw new ValidationError(
                stepCallIds.has(message.discoveryCallId)
                    ? `Discovery call "${message.discoveryCallId}" is answered by more than one tool-discovery message; answer each discovery call exactly once.`
                    : `The tool-discovery message for "${message.discoveryCallId}" does not answer a tool-discovery-call part of the preceding assistant message.`,
                undefined,
                providerId
            );
        }

        if (message.tools.length > 0 && getToolDiscoveryNote(message)) {
            throw new ValidationError(
                `The tool-discovery message for "${message.discoveryCallId}" has both tools and a note; a note only explains a result without tools.`,
                undefined,
                providerId
            );
        }

        for (const tool of message.tools) {
            validateSnapshot(tool, message.discoveryCallId, providerId);
            // Replacing a value keeps the key's first insertion position:
            // order of first discovery, latest snapshot.
            snapshots.set(tool.name, tool);
        }
    }

    assertStepAnswered();
    return snapshots;
}

function validateSnapshot(
    tool: ToolDefinition,
    discoveryCallId: string,
    providerId: string
): void {
    assertNotReserved(tool.name, 'discovered tool', providerId);
    if (!PORTABLE_TOOL_NAME_PATTERN.test(tool.name)) {
        throw new ValidationError(
            `Discovered tool "${tool.name}" (discovery call "${discoveryCallId}") has a name some providers reject; use letters, digits, underscores, and dashes, start with a letter or underscore, and keep it to 128 characters.`,
            undefined,
            providerId
        );
    }
    if (!isPlainObject(tool.parameters) || isStandardSchema(tool.parameters)) {
        throw new ValidationError(
            `Discovered tool "${tool.name}" (discovery call "${discoveryCallId}") must have plain JSON Schema parameters; convert schema objects with toJsonSchema().`,
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
