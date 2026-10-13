import 'dotenv/config';
import { z } from 'zod';
import {
    generate,
    resultToMessage,
    toJsonSchema,
    type Message,
    type ToolDiscoveryCallPart,
    type ToolSnapshot,
} from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';

type CatalogTool = {
    description: string;
    parameters: z.ZodType<Record<string, unknown>>;
    run: (args: Record<string, unknown>) => string;
};

// Tools the model can discover. Only their names reach the prompt until the
// model asks for them.
const catalog: Record<string, CatalogTool> = {
    get_order_status: {
        description: 'Look up the shipping status of an order by its id',
        parameters: z.object({ orderId: z.string() }),
        run: (args) =>
            JSON.stringify({ orderId: args.orderId, status: 'shipped' }),
    },
    cancel_order: {
        description: 'Cancel an order that has not shipped yet',
        parameters: z.object({ orderId: z.string() }),
        run: () => JSON.stringify({ error: 'Order already shipped' }),
    },
};

function getRequiredEnv(name: 'OPENAI_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

/** Answers a discovery call with the catalog tools it asks for. */
function discoverTools(call: ToolDiscoveryCallPart): ToolSnapshot[] {
    const query = call.query?.toLowerCase();
    return Object.entries(catalog)
        .filter(
            ([name, tool]) =>
                call.names?.includes(name) ||
                (query !== undefined &&
                    `${name} ${tool.description}`.toLowerCase().includes(query))
        )
        .map(([name, tool]) => ({
            name,
            description: tool.description,
            parameters: toJsonSchema(tool.parameters),
        }));
}

/** core-ai does not validate calls to discovered tools, so validate here. */
function runTool(name: string, args: Record<string, unknown>): string {
    const tool = catalog[name];
    if (!tool) {
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    const parsed = tool.parameters.safeParse(args);
    return parsed.success
        ? tool.run(parsed.data)
        : JSON.stringify({ error: 'Invalid arguments' });
}

async function main(): Promise<void> {
    const openai = createOpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
    const model = openai.chatModel('gpt-5.4-mini');
    const toolDiscovery = {
        description: `Discoverable tools: ${Object.keys(catalog).join(', ')}.`,
    };
    const messages: Message[] = [
        { role: 'user', content: 'Where is my order A-1042?' },
    ];

    for (let step = 0; step < 5; step += 1) {
        const result = await generate({ model, messages, toolDiscovery });
        messages.push(resultToMessage(result));

        // `toolCalls` never holds discovery calls, so continue from `parts`.
        if (result.finishReason !== 'tool-calls') {
            console.log('Answer:\n', result.content);
            return;
        }

        for (const part of result.parts) {
            if (part.type === 'tool-discovery-call') {
                const tools = discoverTools(part);
                console.log(
                    'Discovered:',
                    tools.map((tool) => tool.name)
                );
                messages.push({
                    role: 'tool-discovery',
                    callId: part.id,
                    tools,
                });
            } else if (part.type === 'tool-call') {
                const { id, name, arguments: args } = part.toolCall;
                console.log('Calling:', name, args);
                messages.push({
                    role: 'tool',
                    toolCallId: id,
                    content: runTool(name, args),
                });
            }
        }
    }
}

void main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
