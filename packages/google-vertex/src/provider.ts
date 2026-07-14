import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import {
    createGoogleProvider,
    type GoogleClient,
    type GoogleProvider,
} from '@core-ai/google';

const PROVIDER_ID = 'google-vertex';

export type GoogleVertexServiceAccountCredentials = Record<
    string,
    unknown
>;

export type GoogleVertexProviderOptions = {
    projectId?: string;
    region?: string;
    credentials?: GoogleVertexServiceAccountCredentials;
    client?: GoogleClient;
};

export type GoogleVertexProvider = GoogleProvider;

export function createGoogleVertex(
    options: GoogleVertexProviderOptions = {}
): GoogleVertexProvider {
    const client = options.client ?? createGoogleVertexClient(options);

    return createGoogleProvider({ client }, PROVIDER_ID);
}

function createGoogleVertexClient(
    options: GoogleVertexProviderOptions
): GoogleClient {
    if (!options.projectId) {
        throw new Error('createGoogleVertex: projectId is required.');
    }
    if (!options.region) {
        throw new Error('createGoogleVertex: region is required.');
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
