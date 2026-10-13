import type {
    GenerateProviderOptions,
    SystemMessageProviderOptions,
    ToolResultMessageProviderOptions,
    UserMessageProviderOptions,
} from '@core-ai/core-ai';
import { z } from 'zod';

export const anthropicCacheControlSchema = z
    .object({
        type: z.literal('ephemeral'),
        ttl: z.enum(['5m', '1h']).optional(),
    })
    .strict();

export type AnthropicCacheControl = z.infer<typeof anthropicCacheControlSchema>;

export const anthropicGenerateProviderOptionsSchema = z
    .object({
        topK: z.number().int().optional(),
        stopSequences: z.array(z.string()).optional(),
        betas: z.array(z.string()).optional(),
        outputConfig: z.record(z.string(), z.unknown()).optional(),
        cacheControl: anthropicCacheControlSchema.optional(),
        /**
         * Renders tool discovery as ordinary tools instead of deferred tools
         * with `tool_reference` results, e.g. behind proxies that do not
         * forward them.
         */
        emulateToolDiscovery: z.boolean().optional(),
    })
    .strict();

export type AnthropicGenerateProviderOptions = z.infer<
    typeof anthropicGenerateProviderOptionsSchema
>;

/**
 * Reads the options namespaced under `providerId` (`model.provider`), so
 * sibling providers such as `anthropic-vertex` own their key and ignore
 * options addressed to `anthropic`.
 */
export function parseAnthropicGenerateProviderOptions(
    providerOptions: GenerateProviderOptions | undefined,
    providerId: string
): AnthropicGenerateProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return anthropicGenerateProviderOptionsSchema.parse(rawOptions);
}

/**
 * Options shared by system, user and tool result messages. Each role gets
 * its own exported name so the roles can diverge without a breaking change.
 */
const anthropicMessageProviderOptionsSchema = z
    .object({
        cacheControl: anthropicCacheControlSchema.optional(),
    })
    .strict();

type AnthropicMessageProviderOptions = z.infer<
    typeof anthropicMessageProviderOptionsSchema
>;

export const anthropicSystemMessageProviderOptionsSchema =
    anthropicMessageProviderOptionsSchema;
export type AnthropicSystemMessageProviderOptions =
    AnthropicMessageProviderOptions;

export const anthropicUserMessageProviderOptionsSchema =
    anthropicMessageProviderOptionsSchema;
export type AnthropicUserMessageProviderOptions =
    AnthropicMessageProviderOptions;

export const anthropicToolResultMessageProviderOptionsSchema =
    anthropicMessageProviderOptionsSchema;
export type AnthropicToolResultMessageProviderOptions =
    AnthropicMessageProviderOptions;

/**
 * Reads system, user or tool result message options namespaced under
 * `providerId` (`model.provider`), like
 * {@link parseAnthropicGenerateProviderOptions}.
 */
export function parseAnthropicMessageProviderOptions(
    providerOptions:
        | SystemMessageProviderOptions
        | UserMessageProviderOptions
        | ToolResultMessageProviderOptions
        | undefined,
    providerId: string
): AnthropicMessageProviderOptions | undefined {
    const rawOptions = providerOptions?.[providerId];
    if (rawOptions === undefined) {
        return undefined;
    }

    return anthropicMessageProviderOptionsSchema.parse(rawOptions);
}

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        anthropic?: AnthropicGenerateProviderOptions;
    }

    interface SystemMessageProviderOptions {
        anthropic?: AnthropicSystemMessageProviderOptions;
    }

    interface UserMessageProviderOptions {
        anthropic?: AnthropicUserMessageProviderOptions;
    }

    interface ToolResultMessageProviderOptions {
        anthropic?: AnthropicToolResultMessageProviderOptions;
    }
}

// Backward-compatible aliases for previous public names.
export const anthropicProviderOptionsSchema =
    anthropicGenerateProviderOptionsSchema;
export type AnthropicProviderOptions = AnthropicGenerateProviderOptions;
export const parseAnthropicProviderOptions =
    parseAnthropicGenerateProviderOptions;
