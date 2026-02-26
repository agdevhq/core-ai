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
import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
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
import { asObject } from './object-utils.js';

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

            if (message.content) {
                assistantParts.push({ text: message.content });
            }

            for (const toolCall of message.toolCalls ?? []) {
                toolCallNameById.set(toolCall.id, toolCall.name);
                assistantParts.push({
                    functionCall: {
                        id: toolCall.id,
                        name: toolCall.name,
                        args: toolCall.arguments,
                    },
                });
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
        const schema = zodToJsonSchema(tool.parameters) as Record<
            string,
            unknown
        >;
        const { $schema: _schema, ...parametersJsonSchema } = schema;

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
    const trimmedName = options.schemaName?.trim();
    if (trimmedName && trimmedName.length > 0) {
        return trimmedName;
    }
    return DEFAULT_STRUCTURED_OUTPUT_TOOL_NAME;
}

export function createStructuredOutputOptions<TSchema extends z.ZodType>(
    options: GenerateObjectOptions<TSchema>
): GenerateOptions {
    const toolName = getStructuredOutputToolName(options);

    return {
        messages: options.messages,
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
        config: options.config,
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

export function createGenerateRequest(
    modelId: string,
    options: GenerateOptions
): GenerateContentParameters {
    const convertedMessages = convertMessages(options.messages);
    const baseRequest: GenerateContentParameters = {
        model: modelId,
        contents: convertedMessages.contents,
        config: {
            ...(convertedMessages.systemInstruction
                ? { systemInstruction: convertedMessages.systemInstruction }
                : {}),
            ...(options.tools && Object.keys(options.tools).length > 0
                ? { tools: convertTools(options.tools) }
                : {}),
            ...(options.toolChoice
                ? { toolConfig: convertToolChoice(options.toolChoice) }
                : {}),
            ...(options.config?.temperature !== undefined
                ? { temperature: options.config.temperature }
                : {}),
            ...(options.config?.maxTokens !== undefined
                ? { maxOutputTokens: options.config.maxTokens }
                : {}),
            ...(options.config?.topP !== undefined
                ? { topP: options.config.topP }
                : {}),
            ...(options.config?.stopSequences
                ? { stopSequences: options.config.stopSequences }
                : {}),
            ...(options.config?.frequencyPenalty !== undefined
                ? { frequencyPenalty: options.config.frequencyPenalty }
                : {}),
            ...(options.config?.presencePenalty !== undefined
                ? { presencePenalty: options.config.presencePenalty }
                : {}),
        },
    };

    const providerOptions = options.providerOptions;
    if (!providerOptions) {
        return baseRequest;
    }

    const providerConfig = asObject(providerOptions['config']);
    return {
        ...baseRequest,
        ...(providerOptions as Partial<GenerateContentParameters>),
        config: {
            ...baseRequest.config,
            ...providerConfig,
        },
    };
}

export function mapGenerateResponse(
    response: GenerateContentResponse
): GenerateResult {
    const toolCalls = parseFunctionCalls(response.functionCalls);
    const finishReason = mapFinishReason(
        response.candidates?.[0]?.finishReason ?? undefined
    );

    if (!response.candidates?.[0]) {
        return {
            content: null,
            toolCalls,
            finishReason: toolCalls.length > 0 ? 'tool-calls' : finishReason,
            usage: mapUsage(response),
        };
    }

    return {
        content: response.text ?? null,
        toolCalls,
        finishReason: toolCalls.length > 0 ? 'tool-calls' : finishReason,
        usage: mapUsage(response),
    };
}

function parseFunctionCalls(
    calls: GoogleFunctionCall[] | undefined
): ToolCall[] {
    if (!calls || calls.length === 0) {
        return [];
    }

    return calls.map((call, index) => mapFunctionCall(call, index));
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
    let finishReason: FinishReason = 'unknown';
    let sawToolCalls = false;
    let usage: GenerateResult['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
    };

    for await (const chunk of stream) {
        usage = mapUsage(chunk, usage);

        if (chunk.text) {
            yield {
                type: 'content-delta',
                text: chunk.text,
            };
        }

        const functionCalls = chunk.functionCalls ?? [];
        if (functionCalls.length > 0) {
            sawToolCalls = true;
            for (const [index, functionCall] of functionCalls.entries()) {
                const mappedCall = mapFunctionCall(functionCall, index);
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

    for (const toolCall of bufferedToolCalls.values()) {
        yield {
            type: 'tool-call-end',
            toolCall,
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

function mapUsage(
    response: GenerateContentResponse,
    fallback?: GenerateResult['usage']
): GenerateResult['usage'] {
    const inputTokens =
        response.usageMetadata?.promptTokenCount ?? fallback?.inputTokens ?? 0;
    const textTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const reasoningTokens =
        response.usageMetadata?.thoughtsTokenCount ??
        fallback?.reasoningTokens ??
        0;
    const outputTokens = textTokens + reasoningTokens;
    const totalTokens =
        response.usageMetadata?.totalTokenCount ??
        fallback?.totalTokens ??
        inputTokens + outputTokens;

    return {
        inputTokens,
        outputTokens,
        reasoningTokens,
        totalTokens,
    };
}
