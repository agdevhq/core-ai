import { describe, it } from 'vitest';
import { providerCases } from './provider-cases.ts';
import type { ProviderContractCase } from './provider-cases.ts';
import type { ProviderE2EAdapter } from './adapters/provider-adapter.ts';

const DEFAULT_CASE_TIMEOUT_MS = 120_000;

export function registerProviderSuite(adapter: ProviderE2EAdapter): void {
    const shouldRunProviderSuite = adapter.isConfigured();
    const describeSuite = shouldRunProviderSuite ? describe : describe.skip;

    describeSuite(`${adapter.displayName} provider e2e`, () => {
        for (const contractCase of providerCases) {
            const shouldRunCase = isContractCaseRunnable(adapter, contractCase);

            if (shouldRunCase) {
                it(
                    `${contractCase.id}: ${contractCase.name}`,
                    async () => {
                        await contractCase.run({ adapter });
                    },
                    contractCase.timeoutMs ?? DEFAULT_CASE_TIMEOUT_MS
                );
                continue;
            }

            it.skip(
                `${contractCase.id}: ${contractCase.name}`,
                () => undefined,
                contractCase.timeoutMs ?? DEFAULT_CASE_TIMEOUT_MS
            );
        }
    });
}

function isContractCaseRunnable(
    adapter: ProviderE2EAdapter,
    contractCase: ProviderContractCase
): boolean {
    if (!adapter.capabilities[contractCase.requiredCapability]) {
        return false;
    }

    if (
        contractCase.requiredCapability === 'embedding' &&
        !adapter.createEmbeddingModel
    ) {
        return false;
    }

    if (
        contractCase.requiredCapability === 'image' &&
        !adapter.createImageModel
    ) {
        return false;
    }

    return true;
}
