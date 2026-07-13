import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type { ChatModel } from '@core-ai/core-ai';
import {
    createAnthropicCompatChatProvider,
    type AnthropicChatClient,
} from '@core-ai/anthropic/compat';
import { GoogleAuth, type JWTInput } from 'google-auth-library';

const PROVIDER_ID = 'vertex-anthropic';
const CLOUD_PLATFORM_AUTH_SCOPE =
    'https://www.googleapis.com/auth/cloud-platform';

export type VertexAnthropicServiceAccountCredentials = Record<
    string,
    unknown
>;

export type VertexAnthropicProviderOptions = {
    projectId?: string;
    region?: string;
    credentials?: VertexAnthropicServiceAccountCredentials;
    client?: AnthropicChatClient;
    defaultMaxTokens?: number;
};

export type VertexAnthropicProvider = {
    chatModel(modelId: string): ChatModel;
};

export function createVertexAnthropic(
    options: VertexAnthropicProviderOptions = {}
): VertexAnthropicProvider {
    const client = options.client ?? createVertexAnthropicClient(options);

    return createAnthropicCompatChatProvider(
        { client, defaultMaxTokens: options.defaultMaxTokens },
        PROVIDER_ID
    );
}

function createVertexAnthropicClient(
    options: VertexAnthropicProviderOptions
): AnthropicChatClient {
    if (!options.projectId) {
        throw new Error('createVertexAnthropic: projectId is required.');
    }
    if (!options.region) {
        throw new Error('createVertexAnthropic: region is required.');
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
