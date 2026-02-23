import type {
    ChatCompletionContentPart,
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions/completions';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
    Message,
    ToolChoice,
    ToolSet,
    UserContentPart,
} from '@core-ai/ai';

export function convertMessages(
    messages: Message[]
): ChatCompletionMessageParam[] {
    return messages.map(convertMessage);
}

function convertMessage(message: Message): ChatCompletionMessageParam {
    if (message.role === 'system') {
        return {
            role: 'system',
            content: message.content,
        };
    }

    if (message.role === 'user') {
        return {
            role: 'user',
            content:
                typeof message.content === 'string'
                    ? message.content
                    : message.content.map(convertUserContentPart),
        };
    }

    if (message.role === 'assistant') {
        return {
            role: 'assistant',
            content: message.content,
            ...(message.toolCalls && message.toolCalls.length > 0
                ? {
                      tool_calls: message.toolCalls.map((toolCall) => ({
                          id: toolCall.id,
                          type: 'function' as const,
                          function: {
                              name: toolCall.name,
                              arguments: JSON.stringify(toolCall.arguments),
                          },
                      })),
                  }
                : {}),
        };
    }

    return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
    };
}

function convertUserContentPart(
    part: UserContentPart
): ChatCompletionContentPart {
    if (part.type === 'text') {
        return {
            type: 'text',
            text: part.text,
        };
    }

    if (part.type === 'image') {
        const url =
            part.source.type === 'url'
                ? part.source.url
                : `data:${part.source.mediaType};base64,${part.source.data}`;

        return {
            type: 'image_url',
            image_url: {
                url,
            },
        };
    }

    return {
        type: 'file',
        file: {
            file_data: part.data,
            ...(part.filename ? { filename: part.filename } : {}),
        },
    };
}

export function convertTools(tools: ToolSet): ChatCompletionTool[] {
    return Object.values(tools).map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.parameters) as Record<
                string,
                unknown
            >,
        },
    }));
}

export function convertToolChoice(
    choice: ToolChoice
): ChatCompletionToolChoiceOption {
    if (typeof choice === 'string') {
        return choice;
    }

    return {
        type: 'function',
        function: {
            name: choice.toolName,
        },
    };
}
