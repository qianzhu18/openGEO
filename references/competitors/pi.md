# Pi Reference

- Repository: <https://github.com/earendil-works/pi>
- License: MIT
- Reviewed `main` commit: `19ce8059c3322f4172f24f0e25aa40bf0bdac62e`
- Local review date: 2026-10-29

## What OpenGEO borrows

- **Minimal harness**: keep the core small and let GEO capabilities be added through Skills, tools, adapters, and packages.
- **On-demand Skills**: advertise `name` and `description`; load full instructions only when a step needs them.
- **Multiple hosts**: interactive CLI, print / JSON mode, RPC, SDK, and eventually MCP can share one engine.
- **Typed runtime contracts**: workflow state, tool parameters, evidence objects, and run events need explicit schemas.
- **Durable sessions and runs**: execution traces should be inspectable and replayable.
- **Package distribution**: OpenGEO market packs and industry packs should be independently installable.

## What OpenGEO changes

- OpenGEO is not a general coding agent; it is a GEO delivery and experiment engine.
- GEO requires immutable evidence: facts, query versions, protocols, raw answers, citations, actions, publication states, and experiments.
- Publication and baseline changes need explicit human gates.
- Budgets, retries, credential redaction, market adapters, and evidence retention are core requirements rather than optional extensions.

## Relevant Pi package lessons

| Pi package | Lesson for OpenGEO |
| --- | --- |
| `@earendil-works/chord` | Typed contracts, observable state, and host boundaries can keep CLI / MCP / SDK from forking behavior |
| `@earendil-works/pi-ai` | A unified model gateway can hide provider differences without discarding provider conditions |
| `@earendil-works/pi-durable` | Conversation, task, and document state should survive restarts |
| `@earendil-works/pi-agent-core` | Keep tool calling, state, and event ordering explicit |
| `@earendil-works/pi-coding-agent` | CLI, JSON, RPC, SDK, Skills, and packages can coexist around one harness |

