# @reaatech/agent-eval-harness-types

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-types)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-types)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml)](https://github.com/reaatech/agent-eval-harness/actions)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Canonical TypeScript domain types, Zod schemas, and interfaces for the agent-eval-harness ecosystem. This package is the foundational dependency of every other package in the monorepo.

## Installation

```bash
npm install @reaatech/agent-eval-harness-types
# or
pnpm add @reaatech/agent-eval-harness-types
```

## Feature Overview

- **19 domain type interfaces** — `Turn`, `Trajectory`, `EvalResult`, `JudgeScore`, `CostBreakdown`, `LatencyBudget`, `GoldenTrajectory`, `RegressionGate`, and more
- **20 Zod schemas** — runtime validation for every domain type with full type inference via `z.infer`
- **Zero runtime dependencies** beyond `zod`
- **Dual ESM/CJS output** — works with `import` and `require`
- **Golden trajectory markers** — `golden`, `expected`, and `quality_notes` fields on every turn
- **CI gate types** — threshold, baseline-comparison, and distribution gates with regression tracking
- **Suite runner types** — configuration, run status, comparison, and metric regression interfaces

## Quick Start

```typescript
import { TurnSchema, type Trajectory, type EvalResult } from '@reaatech/agent-eval-harness-types';

const turn = TurnSchema.parse({
  turn_id: 1,
  role: 'user',
  content: 'Hello',
  timestamp: '2026-04-15T00:00:00Z',
});

const trajectory: Trajectory = { turns: [turn], metadata: { total_turns: 1 } };
```

## API Reference

### Core Types

| Name | Type | Description |
|------|------|-------------|
| `Turn` | `interface` | Single turn in a trajectory with role, content, timestamp, and optional tool calls, latency, and cost |
| `ToolCall` | `interface` | Tool invocation with name, arguments, and optional result |
| `CostData` | `interface` | Token usage and cost for a single turn |
| `Trajectory` | `interface` | Complete agent execution with turns array and optional metadata |
| `EvalResult` | `interface` | Evaluation result with overall score, per-metric scores, and issues |
| `EvalIssue` | `interface` | Issue found during evaluation with type, severity, and description |

### Judge Types

| Name | Type | Description |
|------|------|-------------|
| `JudgeScore` | `interface` | LLM judge scoring result with score, explanation, confidence, and calibration status |

### Cost Types

| Name | Type | Description |
|------|------|-------------|
| `CostBreakdown` | `interface` | Full cost breakdown for a trajectory with LLM, tool, and per-turn costs |
| `TurnCost` | `interface` | Cost breakdown for a single turn with token counts |

### Latency Types

| Name | Type | Description |
|------|------|-------------|
| `LatencyBudget` | `interface` | Latency SLA budget with P50, P90, P99 thresholds and component breakdowns |
| `LatencyResult` | `interface` | Latency measurement result with percentiles, violations, and SLA status |
| `LatencyViolation` | `interface` | SLA violation record with turn ID, actual vs threshold values |

### Golden Types

| Name | Type | Description |
|------|------|-------------|
| `GoldenTrajectory` | `interface` | Golden reference trajectory with versioning and quality markers |

### Gate Types

| Name | Type | Description |
|------|------|-------------|
| `RegressionGate` | `interface` | Gate definition with threshold, baseline-comparison, or distribution types |
| `GateResult` | `interface` | Single gate evaluation result with pass/fail and actual vs expected values |

### Suite Types

| Name | Type | Description |
|------|------|-------------|
| `EvalSuiteConfig` | `interface` | Suite configuration with metrics, judge model, budgets, gates, and parallelism |
| `EvalRunStatus` | `interface` | Suite run progress with status, completion counts, and timing |
| `RunComparison` | `interface` | Comparison of two evaluation runs with metric diffs and significance testing |
| `MetricRegression` | `interface` | Single regression with baseline and candidate values and change percentage |

### Schemas

| Name | Type | Description |
|------|------|-------------|
| `ToolCallSchema` | `ZodObject` | Validates tool invocation structure |
| `CostDataSchema` | `ZodObject` | Validates token counts and cost data |
| `TurnSchema` | `ZodObject` | Validates turn structure with optional tool calls, latency, and golden markers |
| `TrajectoryMetadataSchema` | `ZodObject` | Validates trajectory metadata |
| `TrajectorySchema` | `ZodObject` | Validates complete trajectory (minimum one turn, optional metadata) |
| `EvalIssueSchema` | `ZodObject` | Validates evaluation issue records |
| `EvalResultSchema` | `ZodObject` | Validates evaluation results with metrics and issues |
| `JudgeScoreSchema` | `ZodObject` | Validates judge scoring output |
| `CostBreakdownSchema` | `ZodObject` | Validates cost breakdowns with per-turn cost arrays |
| `LatencyBudgetSchema` | `ZodObject` | Validates latency budget configuration |
| `LatencyViolationSchema` | `ZodObject` | Validates latency SLA violations |
| `LatencyResultSchema` | `ZodObject` | Validates latency measurement results |
| `QualityMarkersSchema` | `ZodObject` | Validates golden trajectory quality markers |
| `GoldenTrajectorySchema` | `ZodObject` | Validates golden trajectories with nested trajectory and quality markers |
| `RegressionGateSchema` | `ZodObject` | Validates regression gate definitions |
| `GateResultSchema` | `ZodObject` | Validates gate evaluation results |
| `EvalSuiteConfigSchema` | `ZodObject` | Validates suite configuration with nested latency budget and gates |
| `EvalRunStatusSchema` | `ZodObject` | Validates suite run status |
| `MetricRegressionSchema` | `ZodObject` | Validates metric regression records |
| `RunComparisonSchema` | `ZodObject` | Validates run comparison results with statistical significance arrays |

## Related Packages

| Package | Description |
|---------|-------------|
| [@reaatech/agent-eval-harness-types](https://www.npmjs.com/package/@reaatech/agent-eval-harness-types) | Shared domain types and Zod schemas |
| [@reaatech/agent-eval-harness-trajectory](https://www.npmjs.com/package/@reaatech/agent-eval-harness-trajectory) | Trajectory loading, evaluation, and golden comparison |
| [@reaatech/agent-eval-harness-tool-use](https://www.npmjs.com/package/@reaatech/agent-eval-harness-tool-use) | Tool-use validation and schema compliance |
| [@reaatech/agent-eval-harness-cost](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cost) | Cost tracking, budgets, and reporting |
| [@reaatech/agent-eval-harness-latency](https://www.npmjs.com/package/@reaatech/agent-eval-harness-latency) | Latency monitoring, SLA enforcement, and optimization |
| [@reaatech/agent-eval-harness-judge](https://www.npmjs.com/package/@reaatech/agent-eval-harness-judge) | LLM-as-judge with calibration and consensus |
| [@reaatech/agent-eval-harness-golden](https://www.npmjs.com/package/@reaatech/agent-eval-harness-golden) | Golden trajectory management and curation |
| [@reaatech/agent-eval-harness-suite](https://www.npmjs.com/package/@reaatech/agent-eval-harness-suite) | Suite runner, results aggregation, and comparison |
| [@reaatech/agent-eval-harness-gate](https://www.npmjs.com/package/@reaatech/agent-eval-harness-gate) | CI regression gates with JUnit and GitHub output |
| [@reaatech/agent-eval-harness-mcp-server](https://www.npmjs.com/package/@reaatech/agent-eval-harness-mcp-server) | MCP server with three-layer tool architecture |
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | Command-line interface |
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | OTel tracing, metrics, structured logging, and dashboards |

## License

[MIT](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
