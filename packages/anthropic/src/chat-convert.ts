import type {
    ContentBlockParam,
    MessageParam,
    Tool,
    ToolChoice,
    ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
    Message,
    ToolSet,
    UserContentPart,
    ToolChoice as AgToolChoice,
} from '@core-ai/ai';

export type ConvertedAnthropicMessages = {
    system: string | undefined;
    messages: MessageParam[];
};

export function convertMessages(
    messages: Message[]
): ConvertedAnthropicMessages {
    const systemParts: string[] = [];
    const convertedMessages: MessageParam[] = [];
    let previousInputWasTool = false;

    for (const message of messages) {
        if (message.role === 'system') {
            systemParts.push(message.content);
            previousInputWasTool = false;
            continue;
        }

        if (message.role === 'user') {
            convertedMessages.push({
                role: 'user',
                content:
                    typeof message.content === 'string'
                        ? message.content
                        : message.content.map(convertUserContentPart),
            });
            previousInputWasTool = false;
            continue;
        }

        if (message.role === 'assistant') {
            const contentBlocks: ContentBlockParam[] = [];

            if (message.content) {
                contentBlocks.push({
                    type: 'text',
                    text: message.content,
                });
            }

            for (const toolCall of message.toolCalls ?? []) {
                contentBlocks.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.name,
                    input: toolCall.arguments,
                });
            }

            convertedMessages.push({
                role: 'assistant',
                content:
                    contentBlocks.length === 0
                        ? ''
                        : contentBlocks.length === 1 &&
                            contentBlocks[0]?.type === 'text'
                          ? contentBlocks[0].text
                          : contentBlocks,
            });
            previousInputWasTool = false;
            continue;
        }

        const toolResultBlock: ToolResultBlockParam = {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
            ...(message.isError ? { is_error: true } : {}),
        };

        if (
            previousInputWasTool &&
            convertedMessages.at(-1)?.role === 'user' &&
            Array.isArray(convertedMessages.at(-1)?.content)
        ) {
            const lastMessage = convertedMessages.at(-1);
            if (lastMessage && Array.isArray(lastMessage.content)) {
                lastMessage.content.push(toolResultBlock);
            }
        } else {
            convertedMessages.push({
                role: 'user',
                content: [toolResultBlock],
            });
        }

        previousInputWasTool = true;
    }

    return {
        system: systemParts.length > 0 ? systemParts.join('\n') : undefined,
        messages: convertedMessages,
    };
}

function convertUserContentPart(part: UserContentPart): ContentBlockParam {
    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text,
        };
    }

    if (part.type === 'image') {
        if (part.source.type === 'url') {
            return {
                type: 'image',
                source: {
                    type: 'url',
                    url: part.source.url,
                },
            };
        }

        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: part.source.mediaType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                data: part.source.data,
            },
        };
    }

    if (part.mimeType !== 'application/pdf') {
        throw new Error(
            'Anthropic only supports PDF file content in this abstraction'
        );
    }

    return {
        type: 'document',
        source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: part.data,
        },
    };
}

export function convertTools(tools: ToolSet): Tool[] {
    return Object.values(tools).map((tool) => {
        const schema = zodToJsonSchema(tool.parameters) as Record<
            string,
            unknown
        >;
        const { $schema: _schema, ...inputSchema } = schema;

        return {
            name: tool.name,
            description: tool.description,
            input_schema: inputSchema as Tool['input_schema'],
        };
    });
}

export function convertToolChoice(choice: AgToolChoice): ToolChoice {
    if (choice === 'auto') {
        return { type: 'auto' };
    }
    if (choice === 'none') {
        return { type: 'none' };
    }
    if (choice === 'required') {
        return { type: 'any' };
    }
    return {
        type: 'tool',
        name: choice.toolName,
    };
}
