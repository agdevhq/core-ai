import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import {
    createGoogleGenAIProvider,
    type GoogleGenAIClient,
    type GoogleGenAIProvider,
} from '@core-ai/google-genai';

const PROVIDER_ID = 'google-vertex';

export type GoogleGenAIVertexServiceAccountCredentials = Record<
    string,
    unknown
>;

export type GoogleGenAIVertexProviderOptions = {
    projectId?: string;
    region?: string;
    credentials?: GoogleGenAIVertexServiceAccountCredentials;
    client?: GoogleGenAIClient;
};

export type GoogleGenAIVertexProvider = GoogleGenAIProvider;

export function createGoogleGenAIVertex(
    options: GoogleGenAIVertexProviderOptions = {}
): GoogleGenAIVertexProvider {
    const client = options.client ?? createGoogleGenAIVertexClient(options);

    return createGoogleGenAIProvider({ client }, PROVIDER_ID);
}

function createGoogleGenAIVertexClient(
    options: GoogleGenAIVertexProviderOptions
): GoogleGenAIClient {
    if (!options.projectId) {
        throw new Error('createGoogleGenAIVertex: projectId is required.');
    }
    if (!options.region) {
        throw new Error('createGoogleGenAIVertex: region is required.');
    }

    const googleAuthOptions: GoogleGenAIOptions['googleAuthOptions'] =
        options.credentials
            ? {
                  credentials: options.credentials,
              }
            : undefined;

    return new GoogleGenAI({
        vertexai: true,
        project: options.projectId,
        location: options.region,
        ...(googleAuthOptions ? { googleAuthOptions } : {}),
    });
}
