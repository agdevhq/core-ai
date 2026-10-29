import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import {
    createGoogleGenAIProvider,
    getGoogleModelCapabilities as getGoogleGenAIModelCapabilities,
    type GoogleGenAIClient,
    type GoogleGenAIProvider,
    type GoogleModelCapabilities,
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
            platform: 'vertex',
        }
    );
}

/** Model capabilities with Vertex AI's limits, as on `chatModel(modelId)`. */
export function getGoogleModelCapabilities(
    modelId: string
): GoogleModelCapabilities {
    return getGoogleGenAIModelCapabilities(modelId, 'vertex');
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
