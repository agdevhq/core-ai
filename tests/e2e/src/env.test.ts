import { afterEach, describe, expect, it } from 'vitest';

import { isEnvFlagEnabled } from './env.ts';

const TEST_ENV_VAR = 'CORE_AI_E2E_TEST_FLAG';

describe('isEnvFlagEnabled', () => {
    afterEach(() => {
        delete process.env[TEST_ENV_VAR];
    });

    it('should accept true case-insensitively', () => {
        process.env[TEST_ENV_VAR] = ' TRUE ';

        expect(isEnvFlagEnabled(TEST_ENV_VAR)).toBe(true);
    });

    it.each([undefined, '', 'false', '1'])(
        'should reject non-true value %s',
        (value) => {
            if (value === undefined) {
                delete process.env[TEST_ENV_VAR];
            } else {
                process.env[TEST_ENV_VAR] = value;
            }

            expect(isEnvFlagEnabled(TEST_ENV_VAR)).toBe(false);
        }
    );
});
