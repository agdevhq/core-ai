---
'@core-ai/google-genai': minor
---

Round-trip thought signatures on function calls. Signatures are read from the candidate parts on generate and stream, exposed under `providerMetadata.google` of the tool call part, and sent back on the matching `functionCall` part. Without this, Gemini 3 rejects multi-step tool calling with a 400 for a missing `thought_signature`. Reasoning signatures are now also emitted on streamed `reasoning-end` events. Stream and generate adapters also read assistant text from candidate parts instead of the SDK `.text` getter, which otherwise warns whenever a chunk mixes text with function calls.
