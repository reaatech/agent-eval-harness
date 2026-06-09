---
"@reaatech/agent-eval-harness-gate": patch
"@reaatech/agent-eval-harness-observability": patch
---

- **@reaatech/agent-eval-harness-gate** (patch): Includes PR #29 'fix: close #28' which resolves CI failures (type check, Docker build) on main and adds observability metrics tests; this is a meaningful, user-visible bug fix flagged with repobot:main-red.
- **@reaatech/agent-eval-harness-observability** (patch): PR #29 'fix: close #28' restores CI for type check and Docker build on main, and PRs #14/#20/#23/#33 upgrade the entire OpenTelemetry stack (resources, sdk-trace-node, sdk-metrics, exporter-zipkin) from 1.x to 2.x with corresponding source changes in tracing.ts and metrics.ts — a meaningful, user-visible patch-level update.
