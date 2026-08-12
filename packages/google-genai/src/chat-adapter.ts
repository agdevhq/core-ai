import {
    FunctionCallingConfigMode,
    type Content,
    type FinishReason as GoogleFinishReason,
    type FunctionCall as GoogleFunctionCall,
    type FunctionDeclaration,
    type GenerateContentParameters,
    type GenerateContentResponse,
    type Part,
    type Tool,
    type ToolConfig,
} from '@google/genai';
import type { z } from 'zod';
import type {
    AssistantContentPart,
    FinishReason,
    GenerateObjectOptions,
    GenerateOptions,
    GenerateResult,
    Message,
    StreamEvent,
    ToolCall,
    ToolChoice,
    ToolSet,
    UserContentPart,
} from '@core-ai/core-ai';
import {
    getProviderMetadata,
    validateInputModalities,
    zodSchemaToJsonSchema,
} from '@core-ai/core-ai';
import {
    getGoogleModelCapabilities,
    toGoogleThinkingBudget,
    toGoogleThinkingLevel,
    type GoogleModelCapabilities,
} from './model-capabilities.js';
import { asObject } from './object-utils.js';
import {
    parseGoogleGenerateProviderOptions,
    type GoogleGenerateProviderOptions,
} from './provider-options.js';

/**
 * Thought signature Google attaches under the `google` provider metadata key.
 * Used on reasoning parts today, and on tool-call parts so Gemini 3 function
 * calls can be replayed without a missing-`thought_signature` 400.
 */
export type GoogleReasoningMetadata = {
    thoughtSignature?: string;
};

/**
 * Default provider id attributed to validation errors when no provider id is
 * given. Callers wrapping the native client (e.g. `@core-ai/google-vertex`)
 * pass their own provider id instead.
 */
export const DEFAULT_PROVIDER_ID = 'google';

export const DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME = 'core_ai_generate_object';
export const DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION =
    'Return a JSON object that matches the requested schema.';

export type ConvertedGoogleMessages = {
    contents: Content[];
    systemInstruction?: string;
};

export function convertMessages(messages: Message[]): ConvertedGoogleMessages {
    const systemParts: string[] = [];
    const contents: Content[] = [];
    const toolCallNameById = new Map<string, string>();

    for (const message of messages) {
        if (message.role === 'system') {
            systemParts.push(message.content);
            continue;
        }

        if (message.role === 'user') {
            const userParts: Part[] =
                typeof message.content === 'string'
                    ? [{ text: message.content }]
                    : message.content.map(convertUserContentPart);

            contents.push({
                role: 'user',
                parts: userParts,
            });
            continue;
        }

        if (message.role === 'assistant') {
            const assistantParts: Part[] = [];
            for (const part of message.parts) {
                if (part.type === 'text') {
                    assistantParts.push({ text: part.text });
                    continue;
                }

                if (part.type === 'tool-call') {
                    toolCallNameById.set(part.toolCall.id, part.toolCall.name);
                    const toolCallSignature =
                        getProviderMetadata<GoogleReasoningMetadata>(
                            part.providerMetadata,
                            'google'
                        )?.thoughtSignature;
                    assistantParts.push({
                        functionCall: {
                            id: part.toolCall.id,
                            name: part.toolCall.name,
                            args: part.toolCall.arguments,
                        },
                        ...(typeof toolCallSignature === 'string'
                            ? { thoughtSignature: toolCallSignature }
                            : {}),
                    });
                    continue;
                }

                const googleMeta = getProviderMetadata<GoogleReasoningMetadata>(
                    part.providerMetadata,
                    'google'
                );
                if (part.text.length === 0) {
                    continue;
                }
                const thoughtPart: Record<string, unknown> = {
                    text: part.text,
                    thought: true,
                };
                if (typeof googleMeta?.thoughtSignature === 'string') {
                    thoughtPart['thoughtSignature'] =
                        googleMeta.thoughtSignature;
                }
                assistantParts.push(thoughtPart as Part);
            }

            contents.push({
                role: 'model',
                parts:
                    assistantParts.length > 0 ? assistantParts : [{ text: '' }],
            });
            continue;
        }

        const functionName =
            toolCallNameById.get(message.toolCallId) ?? message.toolCallId;
        const response = message.isError
            ? { error: message.content }
            : { output: message.content };
        const toolResponsePart: Part = {
            functionResponse: {
                id: message.toolCallId,
                name: functionName,
                response,
            },
        };

        const lastContent = contents.at(-1);
        if (lastContent && isToolResultContent(lastContent)) {
            lastContent.parts?.push(toolResponsePart);
            continue;
        }

        contents.push({
            role: 'user',
            parts: [toolResponsePart],
        });
    }

    return {
        contents,
        systemInstruction:
            systemParts.length > 0 ? systemParts.join('\n') : undefined,
    };
}

function convertUserContentPart(part: UserContentPart): Part {
    if (part.type === 'text') {
        return { text: part.text };
    }

    if (part.type === 'image') {
        if (part.source.type === 'url') {
            return {
                fileData: {
                    fileUri: part.source.url,
                    mimeType: inferMimeTypeFromUrl(part.source.url),
                },
            };
        }

        return {
            inlineData: {
                data: part.source.data,
                mimeType: part.source.mediaType,
            },
        };
    }

    if (part.type === 'audio') {
        return {
            inlineData: {
                data: part.source.data,
                mimeType: part.source.mediaType,
            },
        };
    }

    return {
        inlineData: {
            data: part.data,
            mimeType: part.mimeType,
        },
    };
}

export function convertTools(tools: ToolSet): Tool[] {
    const functionDeclarations: FunctionDeclaration[] = Object.values(
        tools
    ).map((tool) => {
        const { $schema: _schema, ...parametersJsonSchema } =
            zodSchemaToJsonSchema(tool.parameters);

        return {
            name: tool.name,
            description: tool.description,
            parametersJsonSchema,
        };
    });

    if (functionDeclarations.length === 0) {
        return [];
    }

    return [
        {
            functionDeclarations,
        },
    ];
}

export function convertToolChoice(choice: ToolChoice): ToolConfig {
    if (choice === 'auto') {
        return {
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
            },
        };
    }
    if (choice === 'none') {
        return {
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.NONE,
            },
        };
    }
    if (choice === 'required') {
        return {
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
            },
        };
    }

    return {
        functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: [choice.toolName],
        },
    };
}

export function getStructuredOutputToolName<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): string {
    return options.schemaName?.trim() || DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME;
}

export function createStructuredOutputOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): GenerateOptions {
    const toolName = getStructuredOutputToolName(options);

    return {
        messages: options.messages,
        reasoning: options.reasoning,
        tools: {
            structured_output: {
                name: toolName,
                description:
                    options.schemaDescription ??
                    DEFAULT_STRUCTURED_OUTPUT_TOOL_DESCRIPTION,
                parameters: options.schema,
            },
        },
        toolChoice: {
            type: 'tool',
            toolName,
        },
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        providerOptions: options.providerOptions,
        signal: options.signal,
    };
}

function isToolResultContent(content: Content): boolean {
    if (
        content.role !== 'user' ||
        !content.parts ||
        content.parts.length === 0
    ) {
        return false;
    }

    return content.parts.every((part) => part.functionResponse);
}

function inferMimeTypeFromUrl(url: string): string {
    const normalized = url.toLowerCase();
    if (normalized.endsWith('.png')) {
        return 'image/png';
    }
    if (normalized.endsWith('.webp')) {
        return 'image/webp';
    }
    if (normalized.endsWith('.gif')) {
        return 'image/gif';
    }
    if (normalized.endsWith('.svg')) {
        return 'image/svg+xml';
    }
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
        return 'image/jpeg';
    }
    return 'application/octet-stream';
}

/**
 * Wrappers (e.g. `@core-ai/google-vertex`) resolve capabilities once on the
 * chat model. When omitted, the adapter falls back to the Google registry.
 */
export type GoogleAdapterOptions = {
    capabilities?: GoogleModelCapabilities;
};

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions,
    provider = DEFAULT_PROVIDER_ID,
    adapterOptions: GoogleAdapterOptions = {}
): GenerateContentParameters {
    const googleOptions = parseGoogleGenerateProviderOptions(
        options.providerOptions
    );
    const capabilities =
        adapterOptions.capabilities ?? getGoogleModelCapabilities(modelId);
    validateInputModalities({
        messages: options.messages,
        capabilities,
        modelId,
        providerId: provider,
    });
    const convertedMessages = convertMessages(options.messages);
    const requestConfig = {
        ...(convertedMessages.systemInstruction
            ? { systemInstruction: convertedMessages.systemInstruction }
            : {}),
        ...(options.tools && Object.keys(options.tools).length > 0
            ? { tools: convertTools(options.tools) }
            : {}),
        ...(options.toolChoice
            ? { toolConfig: convertToolChoice(options.toolChoice) }
            : {}),
        ...mapSamplingToConfig(options),
        ...mapReasoningToConfig(options, capabilities),
        ...mapGoogleProviderOptionsToConfig(googleOptions),
        ...(options.signal ? { abortSignal: options.signal } : {}),
    };

    return {
        model: modelId,
        contents: convertedMessages.contents,
        config: requestConfig,
    };
}

function mapSamplingToConfig(
    options: Pick<GenerateOptions, 'temperature' | 'maxTokens' | 'topP'>
) {
    return {
        ...(options.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
        ...(options.maxTokens !== undefined
            ? { maxOutputTokens: options.maxTokens }
            : {}),
        ...(options.topP !== undefined ? { topP: options.topP } : {}),
    };
}

function mapGoogleProviderOptionsToConfig(
    options: GoogleGenerateProviderOptions | undefined
): Record<string, unknown> {
    return {
        ...(options?.stopSequences
            ? { stopSequences: options.stopSequences }
            : {}),
        ...(options?.frequencyPenalty !== undefined
            ? { frequencyPenalty: options.frequencyPenalty }
            : {}),
        ...(options?.presencePenalty !== undefined
            ? { presencePenalty: options.presencePenalty }
            : {}),
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
        ...(options?.topK !== undefined ? { topK: options.topK } : {}),
    };
}

export function mapGenerateResponse(
    response: GenerateContentResponse
): GenerateResult {
    const parts = extractAssistantParts(response);
    const toolCalls = parts.flatMap((part) =>
        part.type === 'tool-call' ? [part.toolCall] : []
    );
    const content = parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('');
    const reasoning = parts
        .flatMap((part) => (part.type === 'reasoning' ? [part.text] : []))
        .join('');
    const finishReason = mapFinishReason(
        response.candidates?.[0]?.finishReason ?? undefined
    );

    return {
        parts,
        content: content.length > 0 ? content : null,
        reasoning: reasoning.length > 0 ? reasoning : null,
        toolCalls,
        finishReason: toolCalls.length > 0 ? 'tool-calls' : finishReason,
        usage: mapUsage(response),
    };
}

function mapFunctionCall(
    toolCall: GoogleFunctionCall,
    index: number
): ToolCall {
    return {
        id: toolCall.id ?? `tool-${index}`,
        name: toolCall.name ?? `tool-${index}`,
        arguments: asObject(toolCall.args),
    };
}

function mapFinishReason(reason: GoogleFinishReason | undefined): FinishReason {
    if (reason === 'STOP') {
        return 'stop';
    }
    if (reason === 'MAX_TOKENS') {
        return 'length';
    }
    if (
        reason === 'SAFETY' ||
        reason === 'RECITATION' ||
        reason === 'BLOCKLIST' ||
        reason === 'PROHIBITED_CONTENT' ||
        reason === 'SPII' ||
        reason === 'IMAGE_SAFETY' ||
        reason === 'IMAGE_PROHIBITED_CONTENT' ||
        reason === 'IMAGE_RECITATION'
    ) {
        return 'content-filter';
    }
    return 'unknown';
}

export async function* transformStream(
    stream: AsyncIterable<GenerateContentResponse>
): AsyncIterable<StreamEvent> {
    const bufferedToolCalls = new Map<string, ToolCall>();
    const toolCallSignatures = new Map<string, string>();
    let finishReason: FinishReason = 'unknown';
    let sawToolCalls = false;
    let textOpen = false;
    let reasoningOpen = false;
    let usage: GenerateResult['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        inputTokenDetails: {
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {},
    };
    const closeReasoning = (): StreamEvent | null => {
        if (!reasoningOpen) {
            return null;
        }

        reasoningOpen = false;
        return {
            type: 'reasoning-end',
            providerMetadata: { google: {} },
        };
    };
    const startText = function* (): Iterable<StreamEvent> {
        if (textOpen) {
            return;
        }

        textOpen = true;
        yield { type: 'text-start' };
    };
    const closeText = function* (): Iterable<StreamEvent> {
        if (!textOpen) {
            return;
        }

        textOpen = false;
        yield { type: 'text-end' };
    };

    for await (const chunk of stream) {
        usage = mapUsage(chunk, usage);

        const reasoningDeltas = extractReasoningDeltas(chunk);
        if (reasoningDeltas.length > 0) {
            yield* closeText();
            if (!reasoningOpen) {
                reasoningOpen = true;
                yield {
                    type: 'reasoning-start',
                };
            }

            for (const delta of reasoningDeltas) {
                yield {
                    type: 'reasoning-delta',
                    text: delta,
                };
            }
        }

        const textDeltas = extractTextDeltas(chunk);
        if (textDeltas.length > 0) {
            const reasoningEnd = closeReasoning();
            if (reasoningEnd) {
                yield reasoningEnd;
            }
            yield* startText();
            for (const text of textDeltas) {
                yield {
                    type: 'text-delta',
                    text,
                };
            }
        }

        const functionCalls = extractStreamedFunctionCalls(chunk);
        if (functionCalls.length > 0) {
            yield* closeText();
            const reasoningEnd = closeReasoning();
            if (reasoningEnd) {
                yield reasoningEnd;
            }
            sawToolCalls = true;
            for (const {
                toolCall: mappedCall,
                thoughtSignature,
            } of functionCalls) {
                if (thoughtSignature) {
                    toolCallSignatures.set(mappedCall.id, thoughtSignature);
                }
                const existing = bufferedToolCalls.get(mappedCall.id);
                if (!existing) {
                    bufferedToolCalls.set(mappedCall.id, mappedCall);
                    yield {
                        type: 'tool-call-start',
                        toolCallId: mappedCall.id,
                        toolName: mappedCall.name,
                    };

                    const serializedArguments = JSON.stringify(
                        mappedCall.arguments
                    );
                    if (serializedArguments !== '{}') {
                        yield {
                            type: 'tool-call-delta',
                            toolCallId: mappedCall.id,
                            argumentsDelta: serializedArguments,
                        };
                    }
                    continue;
                }

                const serializedExisting = JSON.stringify(existing.arguments);
                const serializedNext = JSON.stringify(mappedCall.arguments);
                if (serializedExisting !== serializedNext) {
                    bufferedToolCalls.set(mappedCall.id, mappedCall);
                    yield {
                        type: 'tool-call-delta',
                        toolCallId: mappedCall.id,
                        argumentsDelta: serializedNext,
                    };
                }
            }
        }

        const candidateFinishReason = mapFinishReason(
            chunk.candidates?.[0]?.finishReason ?? undefined
        );
        if (candidateFinishReason !== 'unknown') {
            finishReason = candidateFinishReason;
        }
    }

    const reasoningEnd = closeReasoning();
    if (reasoningEnd) {
        yield reasoningEnd;
    }
    yield* closeText();

    for (const toolCall of bufferedToolCalls.values()) {
        const thoughtSignature = toolCallSignatures.get(toolCall.id);
        yield {
            type: 'tool-call-end',
            toolCall,
            ...(thoughtSignature
                ? { providerMetadata: { google: { thoughtSignature } } }
                : {}),
        };
    }

    if (sawToolCalls && finishReason !== 'content-filter') {
        finishReason = 'tool-calls';
    }

    yield {
        type: 'finish',
        finishReason,
        usage,
    };
}

function mapReasoningToConfig(
    options: GenerateOptions,
    capabilities: GoogleModelCapabilities
): Record<string, unknown> {
    if (!options.reasoning) {
        return {};
    }

    if (capabilities.reasoning.thinkingParam === 'thinkingLevel') {
        return {
            thinkingConfig: {
                thinkingLevel: toGoogleThinkingLevel(options.reasoning.effort),
                includeThoughts: true,
            },
        };
    }

    return {
        thinkingConfig: {
            thinkingBudget: toGoogleThinkingBudget(options.reasoning.effort),
            includeThoughts: true,
        },
    };
}

function extractAssistantParts(
    response: GenerateContentResponse
): AssistantContentPart[] {
    const parts: AssistantContentPart[] = [];
    const seenToolCalls = new Set<string>();
    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];

    for (const part of candidateParts) {
        if (part.thought) {
            const thoughtText = typeof part.text === 'string' ? part.text : '';
            if (thoughtText.length === 0) {
                continue;
            }
            const thoughtSignature = readThoughtSignature(part);
            parts.push({
                type: 'reasoning',
                text: thoughtText,
                providerMetadata: {
                    google: {
                        ...(thoughtSignature ? { thoughtSignature } : {}),
                    },
                },
            });
            continue;
        }

        if (part.functionCall) {
            const toolCall = mapFunctionCall(part.functionCall, 0);
            const key = `${toolCall.id}:${toolCall.name}`;
            if (!seenToolCalls.has(key)) {
                seenToolCalls.add(key);
                const thoughtSignature = readThoughtSignature(part);
                parts.push({
                    type: 'tool-call',
                    toolCall,
                    ...(thoughtSignature
                        ? {
                              providerMetadata: {
                                  google: { thoughtSignature },
                              },
                          }
                        : {}),
                });
            }
            continue;
        }

        if (typeof part.text === 'string' && part.text.length > 0) {
            parts.push({
                type: 'text',
                text: part.text,
            });
        }
    }

    for (const [index, functionCall] of (
        response.functionCalls ?? []
    ).entries()) {
        const toolCall = mapFunctionCall(functionCall, index);
        const key = `${toolCall.id}:${toolCall.name}`;
        if (seenToolCalls.has(key)) {
            continue;
        }
        seenToolCalls.add(key);
        parts.push({
            type: 'tool-call',
            toolCall,
        });
    }

    if (parts.length === 0) {
        for (const text of extractTextDeltas(response)) {
            parts.push({
                type: 'text',
                text,
            });
        }
    }

    return parts;
}

type StreamedFunctionCall = {
    toolCall: ToolCall;
    thoughtSignature?: string;
};

/**
 * Reads assistant text from candidate parts so we never touch the SDK `.text`
 * getter. That getter warns whenever the same response also contains
 * functionCall parts, which is normal during tool-calling streams.
 *
 * Falls back to `.text` only when the response has no candidate parts (unit
 * mocks and edge cases).
 */
function extractTextDeltas(response: GenerateContentResponse): string[] {
    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
    if (candidateParts.length > 0) {
        return candidateParts.flatMap((part) => {
            if (part.thought || part.functionCall) {
                return [];
            }
            if (typeof part.text === 'string' && part.text.length > 0) {
                return [part.text];
            }
            return [];
        });
    }

    return typeof response.text === 'string' && response.text.length > 0
        ? [response.text]
        : [];
}

/**
 * Reads function calls from the candidate parts so their thought signatures
 * survive. The `functionCalls` convenience accessor exposes `FunctionCall`
 * objects, which drop the part-level signature Gemini 3 requires back.
 */
function extractStreamedFunctionCalls(
    chunk: GenerateContentResponse
): StreamedFunctionCall[] {
    const candidateParts = chunk.candidates?.[0]?.content?.parts ?? [];
    const fromCandidateParts: StreamedFunctionCall[] = [];
    for (const part of candidateParts) {
        if (!part.functionCall) {
            continue;
        }
        const thoughtSignature = readThoughtSignature(part);
        fromCandidateParts.push({
            toolCall: mapFunctionCall(
                part.functionCall,
                fromCandidateParts.length
            ),
            ...(thoughtSignature ? { thoughtSignature } : {}),
        });
    }

    if (fromCandidateParts.length > 0) {
        return fromCandidateParts;
    }

    return (chunk.functionCalls ?? []).map((functionCall, index) => ({
        toolCall: mapFunctionCall(functionCall, index),
    }));
}

function readThoughtSignature(part: Part): string | undefined {
    return typeof part.thoughtSignature === 'string' &&
        part.thoughtSignature.length > 0
        ? part.thoughtSignature
        : undefined;
}

function extractReasoningDeltas(response: GenerateContentResponse): string[] {
    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
    return candidateParts.flatMap((part) => {
        if (
            !part.thought ||
            typeof part.text !== 'string' ||
            part.text.length === 0
        ) {
            return [];
        }
        return [part.text];
    });
}

function mapUsage(
    response: GenerateContentResponse,
    fallback?: GenerateResult['usage']
): GenerateResult['usage'] {
    const inputTokens =
        response.usageMetadata?.promptTokenCount ?? fallback?.inputTokens ?? 0;
    const textTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const reasoningTokens =
        response.usageMetadata?.thoughtsTokenCount ??
        fallback?.outputTokenDetails?.reasoningTokens;
    const outputTokens = textTokens + (reasoningTokens ?? 0);
    const cacheReadTokens =
        response.usageMetadata?.cachedContentTokenCount ??
        fallback?.inputTokenDetails.cacheReadTokens ??
        0;

    return {
        inputTokens,
        outputTokens,
        inputTokenDetails: {
            cacheReadTokens,
            cacheWriteTokens: 0,
        },
        outputTokenDetails: {
            ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        },
    };
}
