import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import {
    createGoogleGenAIProvider,
    type GoogleGenAIClient,
    type GoogleGenAIProvider,
} from '@core-ai/google-genai';

const PROVIDER_ID = 'google-vertex';

/**
 * The SDK only retries when this is set. Two retries match the default of the
 * OpenAI and Anthropic SDKs.
 */
const REQUEST_RETRY_OPTIONS = { attempts: 3 } as const;

export type GoogleVertexServiceAccountCredentials = NonNullable<
    NonNullable<GoogleGenAIOptions['googleAuthOptions']>['credentials']
>;

export type GoogleVertexProviderOptions = {
    projectId?: string;
    region?: string;
    credentials?: GoogleVertexServiceAccountCredentials;
    client?: GoogleGenAIClient;
};

export type GoogleVertexProvider = GoogleGenAIProvider;

export function createGoogleVertex(
    options: GoogleVertexProviderOptions = {}
): GoogleVertexProvider {
    const client = options.client ?? createGoogleVertexClient(options);

    return createGoogleGenAIProvider(
        { client },
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
        httpOptions: { retryOptions: REQUEST_RETRY_OPTIONS },
        ...(googleAuthOptions ? { googleAuthOptions } : {}),
    });
}
