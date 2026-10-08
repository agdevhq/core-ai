import type { ValidateInputModalitiesOptions } from './validate-input-modalities.ts';
import { validateInputModalities } from './validate-input-modalities.ts';
import { validateSystemMessagePlacement } from './validate-system-message-placement.ts';

export type ValidateMessagesOptions = ValidateInputModalitiesOptions;

/**
 * Runs every message-level capability check (input modalities, system
 * message placement) that provider adapters apply before a request.
 */
export function validateMessages(options: ValidateMessagesOptions): void {
    validateInputModalities(options);
    validateSystemMessagePlacement(options);
}
