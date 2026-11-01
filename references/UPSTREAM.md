# Upstream attribution

OpenGEO includes an unmodified source snapshot of [Albert-Weasker/niubigeo](https://github.com/Albert-Weasker/niubigeo), under Apache-2.0.

- Git tag: v0.3.2
- Commit: dd51eedc8e400006755639c0cb332a7fa1a71420
- Original source, assets, tests and package metadata: `code/vendor/niubigeo/`
- Original license: `code/vendor/niubigeo/LICENSE`
- Two historical public case archives: `code/examples/upstream/R01/` and `code/examples/upstream/R04/`

The snapshot excludes Git history and generated dependencies. It includes the original documentation, examples and release scripts so its existing local checks remain reproducible. It is included as source, not published as an upstream npm package. Root dependencies preserve the upstream lockfile's resolved versions.

OpenGEO's new implementation lives in `code/src/citekeel/`, `code/public/` and `code/skills/`. It directly reuses upstream ProviderCatalog, request-scoped credential redaction, bounded HTTP attempts and URL/citation extraction. The workflow, case adapter, local analysis, task planner, content drafts, report export, persistence and trial interface are new.

Historical archive replay is attributed to the original upstream executions. It is not represented as a new model measurement or an OpenGEO optimization result. No original customer or interview material is distributed.
