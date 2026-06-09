import 'dotenv/config';
import { defineTool, generate, resultToMessage } from '@core-ai/core-ai';
import { createOpenAI } from '@core-ai/openai';
import { z } from 'zod';

const weatherParameters = z.object({
    location: z.string().describe('City name'),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
});

const weatherTool = defineTool({
    name: 'get_weather',
    description: 'Get mocked weather information for a city',
    parameters: weatherParameters,
});

type WeatherArgs = z.infer<typeof weatherParameters>;

function getRequiredEnv(name: 'OPENAI_API_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function runWeatherTool(args: WeatherArgs): string {
    const conditions = ['sunny', 'cloudy', 'windy'];
    const condition = conditions[args.location.length % conditions.length];
    const temperature = 10 + (args.location.length % 18);

    return JSON.stringify({
        location: args.location,
        unit: args.unit,
        temperature,
        condition,
    });
}

async function main(): Promise<void> {
    const openai = createOpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });
    const model = openai.chatModel('gpt-5-mini');
    const initialMessages = [
        {
            role: 'user' as const,
            content: 'What is the weather in Berlin? Reply in one sentence.',
        },
    ];

    const firstResult = await generate({
        model,
        messages: initialMessages,
        tools: { get_weather: weatherTool },
        toolChoice: 'auto',
    });

    if (firstResult.finishReason !== 'tool-calls') {
        console.log(
            'Model response without tool calls:\n',
            firstResult.content
        );
        return;
    }

    const toolMessages = firstResult.toolCalls.map((call) => {
        if (call.name !== 'get_weather') {
            return {
                role: 'tool' as const,
                toolCallId: call.id,
                content: JSON.stringify({
                    error: `Unknown tool: ${call.name}`,
                }),
                isError: true,
            };
        }

        const parsed = weatherParameters.safeParse(call.arguments);
        if (!parsed.success) {
            return {
                role: 'tool' as const,
                toolCallId: call.id,
                content: JSON.stringify({
                    error: 'Invalid arguments',
                    issues: parsed.error.issues,
                }),
                isError: true,
            };
        }

        return {
            role: 'tool' as const,
            toolCallId: call.id,
            content: runWeatherTool(parsed.data),
        };
    });

    const secondResult = await generate({
        model,
        messages: [
            ...initialMessages,
            resultToMessage(firstResult),
            ...toolMessages,
        ],
        tools: { get_weather: weatherTool },
    });

    console.log('Final response:\n', secondResult.content);
}

void main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error.message);
    } else {
        console.error('Unknown error:', error);
    }
    process.exitCode = 1;
});
