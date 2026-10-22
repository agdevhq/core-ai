import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import {
    createGoogleGenAIProvider,
    type GoogleGenAIClient,
    type GoogleGenAIProvider,
} from '@core-ai/google-genai';

const PROVIDER_ID = 'google-vertex';

export type GoogleVertexServiceAccountCredentials = NonNullable<
    NonNullable<GoogleGenAIOptions['googleAuthOptions']>['credentials']
>;

export type GoogleVertexProviderOptions = {
    projectId?: string;
    region?: string;
    credentials?: GoogleVertexServiceAccountCredentials;
    client?: GoogleGenAIClient;
    /**
     * Retries of chat requests that fail transiently (rate limit, overload,
     * 5xx, network failure) before the response starts. Defaults to 2;
     * `0` disables them.
     */
    maxRetries?: number;
};

export type GoogleVertexProvider = GoogleGenAIProvider;

export function createGoogleVertex(
    options: GoogleVertexProviderOptions = {}
): GoogleVertexProvider {
    const client = options.client ?? createGoogleVertexClient(options);

    return createGoogleGenAIProvider(
        { client, maxRetries: options.maxRetries },
        {
            providerId: PROVIDER_ID,
        }
    );
}

function createGoogleVertexClient(
    options: GoogleVertexProviderOptions
): GoogleGenAIClient {
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
