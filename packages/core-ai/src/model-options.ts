export function splitModelFromParams<
    TParams extends {
        model: unknown;
    },
>(params: TParams): {
    model: TParams['model'];
    options: Omit<TParams, 'model'>;
} {
    const { model, ...options } = params;
    return {
        model,
        options,
    };
}

export function callModelWithOptions<
    TParams extends {
        model: unknown;
    },
    TResult,
>(
    params: TParams,
    call: (
        model: TParams['model'],
        options: Omit<TParams, 'model'>
    ) => Promise<TResult>
): Promise<TResult> {
    const { model, options } = splitModelFromParams(params);
    return call(model, options);
}
