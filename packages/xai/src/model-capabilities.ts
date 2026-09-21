import {
    SUPPORTED_TOOL_SCHEMA_STRICTNESS,
    UNKNOWN_MODEL,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
    type ReasoningEffort,
} from '@core-ai/core-ai';

// xAI accepts low / medium / high / xhigh; `max` is sent as `xhigh`.
const CONFIGURABLE_EFFORTS = [
    'low',
    'medium',
    'high',
    'max',
] as const satisfies readonly ReasoningEffort[];

const NO_EFFORTS = [] as const satisfies readonly ReasoningEffort[];

// Every Grok chat model accepts text and image input; none accepts files.
const XAI_MODALITIES = {
    input: ['text', 'image'],
    output: ['text'],
} as const satisfies ModelCapabilities['modalities'];

function createCapabilities(
    mode: ModelCapabilities['reasoning']['mode'],
    supportedEfforts: readonly ReasoningEffort[]
): ModelCapabilities {
    return {
        reasoning: {
            mode,
            supportedEfforts,
            // xAI rejects stop sequences and penalties on reasoning models,
            // not temperature / topP; those are excluded via provider options.
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities: XAI_MODALITIES,
        tools: {
            strictSchemas: SUPPORTED_TOOL_SCHEMA_STRICTNESS,
        },
    };
}

const ALWAYS_ON_REASONING = createCapabilities(
    'always-on',
    CONFIGURABLE_EFFORTS
);
// Reasoning can be turned off server-side, so it is not reported as always-on.
const OPTIONAL_REASONING = createCapabilities('optional', CONFIGURABLE_EFFORTS);
// Reasons, but rejects the reasoning effort parameter.
const FIXED_REASONING = createCapabilities('always-on', NO_EFFORTS);
const NO_REASONING = createCapabilities('unsupported', NO_EFFORTS);

function withAliases(
    capabilities: ModelCapabilities,
    modelIds: readonly string[]
): Record<string, ModelCapabilities> {
    return Object.fromEntries(
        modelIds.map((modelId) => [modelId, capabilities])
    );
}

// Model ids and aliases as reported by `GET /v1/language-models`.
export const XAI_MODEL_CAPABILITIES: ModelCapabilitiesRegistry = {
    // Future models: send an effort only when asked to.
    [UNKNOWN_MODEL]: OPTIONAL_REASONING,
    ...withAliases(ALWAYS_ON_REASONING, [
        'grok-4.7',
        'grok-4.6',
        'grok-4.5',
        'grok-4.5-latest',
        'grok-build-latest',
    ]),
    ...withAliases(OPTIONAL_REASONING, ['grok-4.3', 'grok-4.3-latest']),
    ...withAliases(FIXED_REASONING, [
        'grok-4.20-0309-reasoning',
        'grok-4.20-0309',
        'grok-4.20',
        'grok-4.20-reasoning',
        'grok-4.20-reasoning-latest',
        'grok-4.20-reasoning-gv2',
        'grok-4.20-beta',
        'grok-4.20-beta-0309',
        'grok-4.20-beta-0309-reasoning',
        'grok-4.20-beta-latest',
        'grok-4.20-beta-latest-reasoning',
        'grok-4.20-beta-reasoning',
        'grok-4.20-experimental-beta-0304',
        'grok-4.20-experimental-beta-0304-reasoning',
        'grok-4.20-experimental-beta-latest',
        'grok-4.20-experimental-beta-reasoning-latest',
        'grok-4.20-multi-agent-0309',
        'grok-4.20-multi-agent',
        'grok-4.20-multi-agent-latest',
        'grok-4.20-multi-agent-beta-0309',
        'grok-4.20-multi-agent-beta-latest',
        'grok-4.20-multi-agent-experimental-beta-0304',
        'grok-4.20-multi-agent-experimental-beta-latest',
        'grok-build-0.1',
        'grok-code-fast-1',
        'grok-code-fast-1-0825',
        'grok-code-fast',
    ]),
    ...withAliases(NO_REASONING, [
        'grok-4.20-0309-non-reasoning',
        'grok-4.20-non-reasoning',
        'grok-4.20-non-reasoning-latest',
        'grok-4.20-non-reasoning-gv2',
        'grok-4.20-beta-non-reasoning',
        'grok-4.20-beta-0309-non-reasoning',
        'grok-4.20-beta-latest-non-reasoning',
        'grok-4.20-experimental-beta-0304-non-reasoning',
        'grok-4.20-experimental-beta-non-reasoning-latest',
    ]),
};
