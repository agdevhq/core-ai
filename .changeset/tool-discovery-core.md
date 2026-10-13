---
'@core-ai/core-ai': minor
---

Add tool discovery. With `toolDiscovery` set on `generate` / `stream`, core-ai declares a discovery tool; the model's calls to it arrive as `ToolDiscoveryCallPart`s in `result.parts` (never in `toolCalls`, streamed as one `tool-discovery-call` event), and the application answers each with a `ToolDiscoveryResultMessage` listing `ToolSnapshot`s (tool definitions with plain JSON Schema parameters). Discovered tools are then callable by their real names on every provider and stay declared while their results are in the history. `finishReason: 'tool-calls'` covers pending discovery calls, so loops must continue from `parts`. Malformed discovery histories, reserved tool names, and a `toolChoice` naming a non-caller tool throw `ValidationError` before any provider call.

**Type change:** `ModelCapabilities` gains a required `tools.toolDiscovery` field (`'native' | 'emulated'`), so code that builds capabilities by hand must add it. `Message` and `AssistantContentPart` gain the new members, so exhaustive switches over them must handle them. Adds adapter helpers (`resolveToolDiscovery`, `getEmulatedToolSet`, `emulateToolDiscoveryMessages`, and others); `finalizeGenerateResult` and the `request` option of `createChatStream` turn calls to the discovery tool into discovery calls.
