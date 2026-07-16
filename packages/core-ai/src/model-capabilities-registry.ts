import { stripModelDateSuffix } from './model-id.js';
import type { ModelCapabilities } from './types.js';

export const UNKNOWN_MODEL = Symbol('unknown-model');

export type ModelCapabilitiesRegistry<
    TCapabilities extends ModelCapabilities = ModelCapabilities,
> = Record<string, TCapabilities> & {
    [UNKNOWN_MODEL]?: TCapabilities;
};

export function getRegisteredModelCapabilities<
    TCapabilities extends ModelCapabilities,
>(
    registry: ModelCapabilitiesRegistry<TCapabilities> | undefined,
    modelId: string
): TCapabilities | undefined {
    if (!registry) {
        return undefined;
    }

    return (
        registry[modelId] ??
        registry[stripModelDateSuffix(modelId)] ??
        registry[UNKNOWN_MODEL]
    );
}
