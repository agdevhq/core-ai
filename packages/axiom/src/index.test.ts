import { describe, expect, it } from 'vitest';
import {
    createOtelEmbeddingMiddleware,
    createOtelImageMiddleware,
    createOtelMiddleware,
} from '@core-ai/opentelemetry';
import {
    AXIOM_OTLP_TRACES_ENDPOINT,
    createAxiomEmbeddingMiddleware,
    createAxiomExporterOptions,
    createAxiomImageMiddleware,
    createAxiomMiddleware,
} from './index.ts';

describe('@core-ai/axiom', () => {
    it('exports Axiom middleware aliases for OpenTelemetry GenAI spans', () => {
        expect(createAxiomMiddleware).toBe(createOtelMiddleware);
        expect(createAxiomEmbeddingMiddleware).toBe(createOtelEmbeddingMiddleware);
        expect(createAxiomImageMiddleware).toBe(createOtelImageMiddleware);
    });

    it('creates Axiom OTLP exporter options', () => {
        expect(
            createAxiomExporterOptions({
                token: 'test-token',
                dataset: 'genai',
            })
        ).toEqual({
            url: AXIOM_OTLP_TRACES_ENDPOINT,
            headers: {
                Authorization: 'Bearer test-token',
                'X-Axiom-Dataset': 'genai',
            },
        });
    });

    it('allows overriding the Axiom OTLP endpoint', () => {
        expect(
            createAxiomExporterOptions({
                token: 'test-token',
                dataset: 'genai',
                endpoint: 'https://custom.example.com/v1/traces',
            }).url
        ).toBe('https://custom.example.com/v1/traces');
    });
});
