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

// Includes `grok-4.3`: xAI can turn its reasoning off with effort `none`, but
// core-ai has no such effort, so it always reasons here. It only returns
// encrypted reasoning when asked, which the adapter does for always-on models.
const CONFIGURABLE_REASONING = createCapabilities(
    'always-on',
    CONFIGURABLE_EFFORTS
);
// Reasons, but rejects the reasoning effort parameter.
const FIXED_REASONING = createCapabilities('always-on', NO_EFFORTS);
const NO_REASONING = createCapabilities('unsupported', NO_EFFORTS);

// Model ids and aliases as reported by `GET /v1/language-models`.
export const XAI_MODEL_CAPABILITIES = {
    // New Grok models have all been reasoning models with effort control.
    [UNKNOWN_MODEL]: CONFIGURABLE_REASONING,
    'grok-4.7': CONFIGURABLE_REASONING,
    'grok-4.6': CONFIGURABLE_REASONING,
    'grok-4.5': CONFIGURABLE_REASONING,
    'grok-4.5-latest': CONFIGURABLE_REASONING,
    'grok-build-latest': CONFIGURABLE_REASONING,
    'grok-4.3': CONFIGURABLE_REASONING,
    'grok-4.3-latest': CONFIGURABLE_REASONING,
    'grok-4.20-0309-reasoning': FIXED_REASONING,
    'grok-4.20-0309': FIXED_REASONING,
    'grok-4.20': FIXED_REASONING,
    'grok-4.20-reasoning': FIXED_REASONING,
    'grok-4.20-reasoning-latest': FIXED_REASONING,
    'grok-4.20-reasoning-gv2': FIXED_REASONING,
    'grok-4.20-beta': FIXED_REASONING,
    'grok-4.20-beta-0309': FIXED_REASONING,
    'grok-4.20-beta-0309-reasoning': FIXED_REASONING,
    'grok-4.20-beta-latest': FIXED_REASONING,
    'grok-4.20-beta-latest-reasoning': FIXED_REASONING,
    'grok-4.20-beta-reasoning': FIXED_REASONING,
    'grok-4.20-experimental-beta-0304': FIXED_REASONING,
    'grok-4.20-experimental-beta-0304-reasoning': FIXED_REASONING,
    'grok-4.20-experimental-beta-latest': FIXED_REASONING,
    'grok-4.20-experimental-beta-reasoning-latest': FIXED_REASONING,
    'grok-4.20-multi-agent-0309': FIXED_REASONING,
    'grok-4.20-multi-agent': FIXED_REASONING,
    'grok-4.20-multi-agent-latest': FIXED_REASONING,
    'grok-4.20-multi-agent-beta-0309': FIXED_REASONING,
    'grok-4.20-multi-agent-beta-latest': FIXED_REASONING,
    'grok-4.20-multi-agent-experimental-beta-0304': FIXED_REASONING,
    'grok-4.20-multi-agent-experimental-beta-latest': FIXED_REASONING,
    'grok-build-0.1': FIXED_REASONING,
    'grok-code-fast-1': FIXED_REASONING,
    'grok-code-fast-1-0825': FIXED_REASONING,
    'grok-code-fast': FIXED_REASONING,
    'grok-4.20-0309-non-reasoning': NO_REASONING,
    'grok-4.20-non-reasoning': NO_REASONING,
    'grok-4.20-non-reasoning-latest': NO_REASONING,
    'grok-4.20-non-reasoning-gv2': NO_REASONING,
    'grok-4.20-beta-non-reasoning': NO_REASONING,
    'grok-4.20-beta-0309-non-reasoning': NO_REASONING,
    'grok-4.20-beta-latest-non-reasoning': NO_REASONING,
    'grok-4.20-experimental-beta-0304-non-reasoning': NO_REASONING,
    'grok-4.20-experimental-beta-non-reasoning-latest': NO_REASONING,
} as const satisfies ModelCapabilitiesRegistry;
