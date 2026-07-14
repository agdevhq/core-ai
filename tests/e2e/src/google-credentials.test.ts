import { describe, expect, it } from 'vitest';

import { parseGoogleApplicationCredentialsJson } from './google-credentials.ts';

const sampleCredentials = {
    type: 'service_account',
    project_id: 'my-project',
    client_email: 'test@my-project.iam.gserviceaccount.com',
};

describe('parseGoogleApplicationCredentialsJson', () => {
    it('should parse plain JSON credentials', () => {
        expect(
            parseGoogleApplicationCredentialsJson(
                JSON.stringify(sampleCredentials)
            )
        ).toEqual(sampleCredentials);
    });

    it('should parse base64-encoded JSON credentials', () => {
        const encoded = Buffer.from(
            JSON.stringify(sampleCredentials),
            'utf8'
        ).toString('base64');

        expect(parseGoogleApplicationCredentialsJson(encoded)).toEqual(
            sampleCredentials
        );
    });

    it('should reject non-object JSON payloads', () => {
        expect(() =>
            parseGoogleApplicationCredentialsJson('["not-an-object"]')
        ).toThrowError(/must decode to a JSON object/);
    });

    it('should reject invalid payloads', () => {
        expect(() =>
            parseGoogleApplicationCredentialsJson('not-json-or-base64')
        ).toThrowError(/must contain valid JSON or base64-encoded JSON/);
    });
});
