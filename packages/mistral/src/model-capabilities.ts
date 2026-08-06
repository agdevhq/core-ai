import {
    getRegisteredModelCapabilities,
    stripModelDateSuffix,
    UNKNOWN_MODEL,
    type ModelCapabilities,
    type ModelCapabilitiesRegistry,
} from '@core-ai/core-ai';

export type MistralModelCapabilities = ModelCapabilities;

/** Mistral versions models with a `-YYMM` suffix, or the `-latest` alias. */
const MISTRAL_VERSION_SUFFIX_PATTERN = /-(?:latest|\d{4})$/;

const IMAGE_INPUT = {
    supported: true,
    supportedSources: ['base64', 'url'],
} as const satisfies ModelCapabilities['modalities']['imageInput'];
const NO_IMAGE_INPUT = {
    supported: false,
    supportedSources: [],
} as const satisfies ModelCapabilities['modalities']['imageInput'];

function createCapabilities(
    imageInput: ModelCapabilities['modalities']['imageInput']
): MistralModelCapabilities {
    return {
        reasoning: {
            mode: 'unsupported',
            supportedEfforts: [],
            restrictsSamplingParams: false,
            supportedToolChoices: ['auto', 'none', 'required', 'tool'],
        },
        modalities: { imageInput },
    };
}

const VISION_CAPABILITIES = createCapabilities(IMAGE_INPUT);
const TEXT_ONLY_CAPABILITIES = createCapabilities(NO_IMAGE_INPUT);

/**
 * Keyed by version-less model ID, describing the generation that `-latest`
 * currently resolves to. Unknown models are treated as vision-capable so that
 * self-hosted and newly released models keep working.
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
    const registry: ModelCapabilitiesRegistry<MistralModelCapabilities> =
        MISTRAL_MODEL_CAPABILITIES;

    // Exact ID first (versioned text-only pins), then family / UNKNOWN_MODEL.
    // FAMILY_CAPABILITIES always includes [UNKNOWN_MODEL], so this is defined.
    return (
        registry[modelId] ??
        getRegisteredModelCapabilities(registry, normalizeModelId(modelId))!
    );
}

export function normalizeModelId(modelId: string): string {
    return stripModelDateSuffix(modelId).replace(
        MISTRAL_VERSION_SUFFIX_PATTERN,
        ''
    );
}
