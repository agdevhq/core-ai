export {
    createOtelEmbeddingMiddleware as createAxiomEmbeddingMiddleware,
    createOtelImageMiddleware as createAxiomImageMiddleware,
    createOtelMiddleware as createAxiomMiddleware,
    type OtelMiddlewareOptions as AxiomMiddlewareOptions,
} from '@core-ai/opentelemetry';

export const AXIOM_OTLP_TRACES_ENDPOINT = 'https://api.axiom.co/v1/traces' as const;

export type AxiomExporterConfig = {
    token: string;
    dataset: string;
    endpoint?: string;
};

export type AxiomExporterOptions = {
    url: string;
    headers: {
        Authorization: string;
        'X-Axiom-Dataset': string;
    };
};

export function createAxiomExporterOptions(
    config: AxiomExporterConfig
): AxiomExporterOptions {
    return {
        url: config.endpoint ?? AXIOM_OTLP_TRACES_ENDPOINT,
        headers: {
            Authorization: `Bearer ${config.token}`,
            'X-Axiom-Dataset': config.dataset,
        },
    };
}
