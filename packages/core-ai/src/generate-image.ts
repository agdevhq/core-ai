import { LLMError } from './errors.ts';
import type {
    ImageGenerateOptions,
    ImageGenerateResult,
    ImageModel,
} from './types.ts';

export type GenerateImageParams = ImageGenerateOptions & {
    model: ImageModel;
};

export async function generateImage(
    params: GenerateImageParams
): Promise<ImageGenerateResult> {
    if (params.prompt.length === 0) {
        throw new LLMError('prompt must not be empty');
    }

    const { model, ...options } = params;
    return model.generate(options);
}
