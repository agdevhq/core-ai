const MODEL_DATE_SUFFIX_PATTERN = /[-@](?:\d{8}|\d{4}-\d{2}-\d{2})$/;

export function stripModelDateSuffix(modelId: string): string {
    return modelId.replace(MODEL_DATE_SUFFIX_PATTERN, '');
}
