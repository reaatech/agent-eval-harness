# @reaatech/agent-eval-harness-observability

## 0.1.1

### Patch Changes

- [`b196e7c`](https://github.com/reaatech/agent-eval-harness/commit/b196e7c6877c1cb829e91917ecb5190f7ddaf45c) Thanks [@reaatech](https://github.com/reaatech)! - - **@reaatech/agent-eval-harness-gate** (patch): Includes PR [#29](https://github.com/reaatech/agent-eval-harness/issues/29) 'fix: close [#28](https://github.com/reaatech/agent-eval-harness/issues/28)' which resolves CI failures (type check, Docker build) on main and adds observability metrics tests; this is a meaningful, user-visible bug fix flagged with repobot:main-red.
  - **@reaatech/agent-eval-harness-observability** (patch): PR [#29](https://github.com/reaatech/agent-eval-harness/issues/29) 'fix: close [#28](https://github.com/reaatech/agent-eval-harness/issues/28)' restores CI for type check and Docker build on main, and PRs [#14](https://github.com/reaatech/agent-eval-harness/issues/14)/[#20](https://github.com/reaatech/agent-eval-harness/issues/20)/[#23](https://github.com/reaatech/agent-eval-harness/issues/23)/[#33](https://github.com/reaatech/agent-eval-harness/issues/33) upgrade the entire OpenTelemetry stack (resources, sdk-trace-node, sdk-metrics, exporter-zipkin) from 1.x to 2.x with corresponding source changes in tracing.ts and metrics.ts — a meaningful, user-visible patch-level update.
