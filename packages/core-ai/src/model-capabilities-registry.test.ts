import { describe, expect, it } from 'vitest';

import {
    getRegisteredModelCapabilities,
    UNKNOWN_MODEL,
    type ModelCapabilitiesRegistry,
} from './model-capabilities-registry.js';
import type { ModelCapabilities } from './types.js';

const KNOWN_CAPABILITIES: ModelCapabilities = {
    reasoning: {
        supported: true,
        supportedEfforts: ['high'],
        restrictsSamplingParams: true,
    },
};

const UNKNOWN_CAPABILITIES: ModelCapabilities = {
    reasoning: {
        supported: false,
        supportedEfforts: [],
        restrictsSamplingParams: false,
    },
};

const REGISTRY = {
    'known-model': KNOWN_CAPABILITIES,
    [UNKNOWN_MODEL]: UNKNOWN_CAPABILITIES,
} as const satisfies ModelCapabilitiesRegistry;

describe('getRegisteredModelCapabilities', () => {
    it('should return capabilities registered for an exact model ID', () => {
        expect(getRegisteredModelCapabilities(REGISTRY, 'known-model')).toBe(
            KNOWN_CAPABILITIES
        );
    });

    it('should normalize date-suffixed model IDs', () => {
        expect(
            getRegisteredModelCapabilities(REGISTRY, 'known-model-2026-07-15')
        ).toBe(KNOWN_CAPABILITIES);
    });

    it('should return symbol-keyed capabilities for unknown models', () => {
        expect(getRegisteredModelCapabilities(REGISTRY, 'other-model')).toBe(
            UNKNOWN_CAPABILITIES
        );
    });
});
