import type {
    GoogleGenAI,
} from '@google/genai';
import type {
    ChatModel,
    GenerateOptions,
    GenerateResult,
    StreamResult,
} from '@core-ai/core-ai';
import { createStreamResult } from '@core-ai/core-ai';
import {
    createGenerateRequest,
    mapGenerateResponse,
    transformStream,
    wrapError,
} from './chat-adapter.js';

type GoogleGenAIChatClient = {
    models: GoogleGenAI['models'];
};

export function createGoogleGenAIChatModel(
    client: GoogleGenAIChatClient,
    modelId: string
): ChatModel {
    return {
        provider: 'google',
        modelId,
        async generate(options: GenerateOptions): Promise<GenerateResult> {
            try {
                const request = createGenerateRequest(modelId, options);
                const response = await client.models.generateContent(request);
                return mapGenerateResponse(response);
            } catch (error) {
                throw wrapError(error);
            }
        },
        async stream(options: GenerateOptions): Promise<StreamResult> {
            try {
                const request = createGenerateRequest(modelId, options);
                const stream = await client.models.generateContentStream(request);

                return createStreamResult(transformStream(stream));
            } catch (error) {
                throw wrapError(error);
            }
        },
    };
}
