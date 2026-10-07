import type {
    GoogleEmbedProviderOptions,
    GoogleGenerateProviderOptions,
    GoogleImageProviderOptions,
} from '@core-ai/google-genai';

export type GoogleVertexGenerateProviderOptions = GoogleGenerateProviderOptions;
export type GoogleVertexEmbedProviderOptions = GoogleEmbedProviderOptions;
export type GoogleVertexImageProviderOptions = GoogleImageProviderOptions;

declare module '@core-ai/core-ai' {
    interface GenerateProviderOptions {
        'google-vertex'?: GoogleVertexGenerateProviderOptions;
    }

    interface EmbedProviderOptions {
        'google-vertex'?: GoogleVertexEmbedProviderOptions;
    }

    interface ImageProviderOptions {
        'google-vertex'?: GoogleVertexImageProviderOptions;
    }
}
