import {
    getRegisteredModelCapabilities,
    MULTIMODAL_INPUT_MODALITIES,
    stripModelDateSuffix,
    TEXT_ONLY_MODALITIES,
    UNKNOWN_MODEL,
    UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
} from '@core-ai/core-ai';

export type MistralModelCapabilities = ModelCapabilities;

/** Mistral versions models with a `-YYMM` suffix, or the `-latest` alias. */
const MISTRAL_VERSION_SUFFIX_PATTERN = /-(?:latest|\d{4})$/;

const DATED_MODEL_ID_PATTERN = /^(mistral-small|mistral-medium)-(\d{4})$/;
const LARGE_4_MODEL_ID_PATTERN = /^mistral-large-4(?:-\d+)?$/;

/**
 * Aliases that currently resolve to an adjustable-reasoning generation.
 * Date-stamped pins are handled separately so older releases stay put.
 */
const ADJUSTABLE_REASONING_MODEL_IDS = new Set([
    'mistral-small-latest',
    'mistral-medium-latest',
    'mistral-medium-3',
    'mistral-medium-3-5',
]);

const TOOL_CHOICES = ['auto', 'none', 'required', 'tool'] as const;

const NO_REASONING = {
    mode: 'unsupported',
    supportedEfforts: [],
    restrictsSamplingParams: false,
    supportedToolChoices: TOOL_CHOICES,
} as const satisfies ModelCapabilities['reasoning'];

/**
 * Mistral's own adjustable models accept `none` and `high`. `minimal` is the
 * off switch (`none`); `high` is the on switch.
 */
const ADJUSTABLE_REASONING = {
    mode: 'optional',
    supportedEfforts: ['minimal', 'high'],
    restrictsSamplingParams: false,
    supportedToolChoices: TOOL_CHOICES,
} as const satisfies ModelCapabilities['reasoning'];

/** GLM 5, hosted on the Mistral API, accepts `low`, `high`, and `max`. */
const GLM_REASONING = {
    mode: 'optional',
    supportedEfforts: ['low', 'high', 'max'],
    restrictsSamplingParams: false,
    supportedToolChoices: TOOL_CHOICES,
} as const satisfies ModelCapabilities['reasoning'];

function createCapabilities(
    modalities: ModelCapabilities['modalities'],
    reasoning: ModelCapabilities['reasoning'] = NO_REASONING
): MistralModelCapabilities {
    return {
        reasoning,
        modalities,
        tools: {
            // Mistral's SDK exposes a `strict` field on functions, but the API
            // does not document grammar-enforced adherence — keep unsupported
            // until enforcement is verified (follow-up candidate).
            strictSchemas: UNSUPPORTED_TOOL_SCHEMA_STRICTNESS,
        },
    };
}

const VISION_CAPABILITIES = createCapabilities(MULTIMODAL_INPUT_MODALITIES);
const TEXT_ONLY_CAPABILITIES = createCapabilities(TEXT_ONLY_MODALITIES);
const ADJUSTABLE_VISION_CAPABILITIES = createCapabilities(
    MULTIMODAL_INPUT_MODALITIES,
    ADJUSTABLE_REASONING
);
const GLM_CAPABILITIES = createCapabilities(
    TEXT_ONLY_MODALITIES,
    GLM_REASONING
);

/**
 * Keyed by version-less model ID. `-latest` and `-YYMM` normalize to these
 * keys unless a more specific profile matches first. Unknown models are
 * treated as vision-capable so that self-hosted and newly released models
 * keep working.
 */
const FAMILY_CAPABILITIES = {
    'mistral-large': VISION_CAPABILITIES,
    'mistral-medium': VISION_CAPABILITIES,
    'mistral-small': VISION_CAPABILITIES,
    'magistral-medium': VISION_CAPABILITIES,
    'magistral-small': VISION_CAPABILITIES,
    'pixtral-large': VISION_CAPABILITIES,
    'pixtral-12b': VISION_CAPABILITIES,
    'ministral-3b': VISION_CAPABILITIES,
    'ministral-8b': VISION_CAPABILITIES,
    'ministral-14b': VISION_CAPABILITIES,
    codestral: TEXT_ONLY_CAPABILITIES,
    'codestral-mamba': TEXT_ONLY_CAPABILITIES,
    devstral: TEXT_ONLY_CAPABILITIES,
    'devstral-medium': TEXT_ONLY_CAPABILITIES,
    'devstral-small': TEXT_ONLY_CAPABILITIES,
    'open-mistral-7b': TEXT_ONLY_CAPABILITIES,
    'open-mistral-nemo': TEXT_ONLY_CAPABILITIES,
    'open-mixtral-8x7b': TEXT_ONLY_CAPABILITIES,
    'open-mixtral-8x22b': TEXT_ONLY_CAPABILITIES,
    [UNKNOWN_MODEL]: VISION_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry<MistralModelCapabilities>;

/**
 * Versions that predate the generation their family entry describes. Mistral
 * added vision to each family at a specific release, so a pinned older version
 * must not inherit the current generation's capabilities.
 */
const VERSIONED_CAPABILITIES = {
    // Vision arrived with Mistral Large 3 (`-2512`).
    'mistral-large-2402': TEXT_ONLY_CAPABILITIES,
    'mistral-large-2407': TEXT_ONLY_CAPABILITIES,
    'mistral-large-2411': TEXT_ONLY_CAPABILITIES,
    // Vision arrived with Mistral Medium 3 (`-2505`).
    'mistral-medium-2312': TEXT_ONLY_CAPABILITIES,
    // Vision arrived with Mistral Small 3.1 (`-2503`).
    'mistral-small-2402': TEXT_ONLY_CAPABILITIES,
    'mistral-small-2409': TEXT_ONLY_CAPABILITIES,
    'mistral-small-2501': TEXT_ONLY_CAPABILITIES,
    // Vision arrived with Magistral 1.2 (`-2509`).
    'magistral-medium-2506': TEXT_ONLY_CAPABILITIES,
    'magistral-medium-2507': TEXT_ONLY_CAPABILITIES,
    'magistral-small-2506': TEXT_ONLY_CAPABILITIES,
    'magistral-small-2507': TEXT_ONLY_CAPABILITIES,
    // Vision arrived with Ministral 3 (`-2512`).
    'ministral-3b-2410': TEXT_ONLY_CAPABILITIES,
    'ministral-8b-2410': TEXT_ONLY_CAPABILITIES,
} as const satisfies Record<string, MistralModelCapabilities>;

export const MISTRAL_MODEL_CAPABILITIES = {
    ...VERSIONED_CAPABILITIES,
    ...FAMILY_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry<MistralModelCapabilities>;

export function getMistralModelCapabilities(
    modelId: string
): MistralModelCapabilities {
    if (isZaiGlmModel(modelId)) {
        return GLM_CAPABILITIES;
    }

    if (supportsAdjustableReasoning(modelId)) {
        return ADJUSTABLE_VISION_CAPABILITIES;
    }

    const registry: ModelCapabilitiesRegistry<MistralModelCapabilities> =
        MISTRAL_MODEL_CAPABILITIES;

    // Exact ID first (versioned text-only pins), then family / UNKNOWN_MODEL.
    // FAMILY_CAPABILITIES always includes [UNKNOWN_MODEL], so this is defined.
    return (
        registry[modelId] ??
        getRegisteredModelCapabilities(registry, normalizeModelId(modelId))!
    );
}

function isZaiGlmModel(modelId: string): boolean {
    return (
        modelId === 'zai-glm-latest' ||
        modelId === 'zai-glm-5' ||
        modelId.startsWith('zai-glm-5-')
    );
}

/**
 * Small 4, Medium 3.5, and Large 4 accept `reasoning_effort`. Later
 * date-stamped small and medium releases follow them. Older pins do not.
 */
function supportsAdjustableReasoning(modelId: string): boolean {
    if (
        ADJUSTABLE_REASONING_MODEL_IDS.has(modelId) ||
        LARGE_4_MODEL_ID_PATTERN.test(modelId)
    ) {
        return true;
    }

    const dated = DATED_MODEL_ID_PATTERN.exec(modelId);
    const family = dated?.[1];
    const versionText = dated?.[2];
    if (family === undefined || versionText === undefined) {
        return false;
    }

    const version = Number(versionText);
    if (family === 'mistral-small') {
        return version >= 2603;
    }

    return version >= 2604;
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId).replace(
        MISTRAL_VERSION_SUFFIX_PATTERN,
        ''
    );
}
