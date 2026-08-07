---
'@core-ai/core-ai': minor
---

Add chat modality capabilities as directional arrays on `ModelCapabilities.modalities`: `input` (`ChatInputModality[]`) and `output` (`ChatOutputModality[]`). Common presets (`TEXT_ONLY_MODALITIES`, `MULTIMODAL_INPUT_MODALITIES`) and helpers (`supportsInputModality`, `supportsOutputModality`) are exported. Multimodal chat models advertise `['text', 'image', 'file']` input; audio and video remain reserved until dedicated user content parts exist.

The new `validateInputModalities` helper rejects any user content parts whose modalities are missing from `capabilities.modalities.input`, and throws `UnsupportedInputModalityError` (a `ValidationError`) with the requested, supported, and unsupported modality lists. Provider adapters run the same check before sending a request.

`modalities` is required, so custom `ChatModel` implementations and custom `ModelCapabilitiesRegistry` values must add it.
