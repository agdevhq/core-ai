---
'@core-ai/core-ai': minor
---

Add chat modality capabilities as directional arrays on `ModelCapabilities.modalities`: `input` (`ChatInputModality[]`) and `output` (`ChatOutputModality[]`). Common presets (`TEXT_ONLY_MODALITIES`, `MULTIMODAL_INPUT_MODALITIES`) and helpers (`supportsInputModality`, `supportsOutputModality`) are exported. Multimodal chat models advertise `['text', 'image', 'file']` input; audio and video remain reserved until dedicated user content parts exist. The new `validateImageInput` helper is exported so callers can pre-flight the same check that provider adapters now run before a request is sent. It takes a single `ValidateImageInputOptions` object (`messages`, `capabilities`, `modelId`, `providerId`).

`modalities` is required, so custom `ChatModel` implementations and custom `ModelCapabilitiesRegistry` values must add it.
