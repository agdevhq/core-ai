import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type { ChatModel } from '@core-ai/core-ai';
import {
    createAnthropicChatProvider,
    type AnthropicChatClient,
} from '@core-ai/anthropic';
import { GoogleAuth, type JWTInput } from 'google-auth-library';

const PROVIDER_ID = 'anthropic-vertex';
const CLOUD_PLATFORM_AUTH_SCOPE =
    'https://www.googleapis.com/auth/cloud-platform';

export type AnthropicVertexServiceAccountCredentials = Record<string, unknown>;

export type AnthropicVertexProviderOptions = {
    projectId?: string;
    region?: string;
    credentials?: AnthropicVertexServiceAccountCredentials;
    client?: AnthropicChatClient;
    defaultMaxTokens?: number;
    strictToolSchemas?: boolean;
};

export type AnthropicVertexProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createAnthropicVertex(
    options: AnthropicVertexProviderOptions = {}
): AnthropicVertexProvider {
    const client = options.client ?? createAnthropicVertexClient(options);

    return createAnthropicChatProvider(
        {
            client,
            defaultMaxTokens: options.defaultMaxTokens,
            strictToolSchemas: options.strictToolSchemas ?? true,
        },
        PROVIDER_ID
    );
}

function createAnthropicVertexClient(
    options: AnthropicVertexProviderOptions
): AnthropicChatClient {
    if (!options.projectId) {
        throw new Error('createAnthropicVertex: projectId is required.');
    }
    if (!options.region) {
        throw new Error('createAnthropicVertex: region is required.');
    }

    // Without explicit credentials, the SDK falls back to Google Application
    // Default Credentials (ADC), which is the expected setup for most
    // deployments running on Google Cloud infrastructure.
    const googleAuth = options.credentials
        ? new GoogleAuth({
              credentials: options.credentials as JWTInput,
              scopes: [CLOUD_PLATFORM_AUTH_SCOPE],
          })
        : undefined;

    return new AnthropicVertex({
        projectId: options.projectId,
        region: options.region,
        ...(googleAuth
            ? {
                  // `@anthropic-ai/vertex-sdk` bundles its own
                  // `google-auth-library` dependency, so the SDK's `GoogleAuth`
                  // type is nominally incompatible with the workspace copy
                  // because of private fields. At runtime, the SDK only uses
                  // the public auth methods, so we cast at the package
                  // boundary.
                  googleAuth: googleAuth as unknown as NonNullable<
                      ConstructorParameters<typeof AnthropicVertex>[0]
                  >['googleAuth'],
              }
            : {}),
    });
}
