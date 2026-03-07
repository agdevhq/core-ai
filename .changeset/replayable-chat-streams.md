---
'@core-ai/core-ai': minor
---

Redesign chat and object streaming around replayable stream handles with `result` and `events`, rename the handle types to `ChatStream` and `ObjectStream`, and accept caller-provided `AbortSignal`s for cancellation.
