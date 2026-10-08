---
'@core-ai/anthropic': patch
---

Model ID aliases ending in `-latest` or `-0` (such as `claude-3-7-sonnet-latest` and `claude-sonnet-4-0`) now resolve to the capabilities of the model they point at, and the Vertex ID `claude-3-5-sonnet-v2` is recognized as Claude 3.5 Sonnet. Before, they fell back to the defaults for unknown models, including `systemPlacement`, thinking mode, strict tool schemas, and output ceiling.
