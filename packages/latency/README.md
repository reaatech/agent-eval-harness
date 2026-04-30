# @reaatech/agent-eval-harness-latency

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-latency)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-latency)
[![license](https://img.shields.io/npm/l/@reaatech/agent-eval-harness-latency)](https://github.com/reaatech/agent-eval-harness/blob/main/packages/latency/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml?branch=main)](https://github.com/reaatech/agent-eval-harness/actions)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Turn-level and trajectory-level latency monitoring with SLA enforcement and optimization analysis. Computes P50/P90/P99 percentiles, detects anomalies, and provides actionable bottleneck recommendations for AI agent latency budgets.

## Installation

```bash
npm install @reaatech/agent-eval-harness-latency
```

## Feature Overview

- **Percentile computation** — P50, P90, P99 latency metrics computed per turn and aggregated across the full trajectory
- **Component breakdown** — Separates LLM call latency from tool invocation latency and system overhead for targeted optimization
- **SLA enforcement** — Configurable per-turn and per-trajectory latency thresholds with severity-graded violation detection and early-warning signals
- **Three latency presets** — `strict` (P50: 500ms, P90: 1000ms, P99: 2000ms), `moderate` (P50: 1000ms, P90: 2000ms, P99: 5000ms), `lenient` (P50: 2000ms, P90: 4000ms, P99: 10000ms)
- **Anomaly detection** — Identifies outlier turns whose latency exceeds a configurable multiplier of the average, with a minimum 1000ms floor
- **Optimization analysis** — Ranked bottleneck identification (LLM call, tool invocation, overhead, total) with priority-ordered recommendations covering model selection, batching, streaming, caching, prompt shortening, and turn reduction
- **Latency trend tracking** — `LatencyTracker` class records history and computes improvement trends across evaluation runs

## Quick Start

```typescript
import { monitorLatency, enforceBudget, createLatencyBudget } from '@reaatech/agent-eval-harness-latency';
import type { Trajectory } from '@reaatech/agent-eval-harness-types';

// Assume trajectory loaded from JSONL
const result = monitorLatency(trajectory);
console.log(`P50: ${result.p50Ms}ms, P99: ${result.p99Ms}ms, Total: ${result.totalLatencyMs}ms`);

const budget = createLatencyBudget('moderate');
const enforcement = enforceBudget(result, budget);
console.log(`Within SLA: ${enforcement.passed}, Violations: ${enforcement.violations.length}`);
```

## API Reference

### Monitoring Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `monitorLatency` | `(trajectory: Trajectory) => LatencyResult` | Extracts per-turn latency from agent turns, computes P50/P90/P99 percentiles, total, average, min, and max latency |
| `getComponentBreakdown` | `(result: LatencyResult) => ComponentBreakdown` | Breaks down latency into average and total LLM call, tool invocation, and overhead components |
| `compareLatency` | `(baseline: LatencyResult, candidate: LatencyResult) => { avgDiffMs, p99DiffMs, faster, percentageChange }` | Compares two latency results and returns differences with directional indication |
| `detectAnomalies` | `(result: LatencyResult, thresholdMultiplier?: number) => TurnLatency[]` | Returns turns where latency exceeds `avgLatencyMs * thresholdMultiplier` (default 2x) and is above 1000ms |

### Budget Enforcement Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `enforceBudget` | `(result: LatencyResult, budget: LatencyBudget) => BudgetEnforcementResult` | Validates latency result against budget thresholds, returns violations, warnings, and a composite score (0–1) |
| `createLatencyBudget` | `(preset: 'strict' \| 'moderate' \| 'lenient') => LatencyBudget` | Returns a pre-configured budget with P50/P90/P99 max turn, trajectory total, and component thresholds |
| `formatLatency` | `(ms: number) => string` | Formats milliseconds into human-readable strings: `ms`, `s`, or `m` |

### Optimization Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `analyzeOptimization` | `(result: LatencyResult, trajectory?: Trajectory) => OptimizationResult` | Identifies bottlenecks, generates ranked recommendations with estimated improvement, and computes an optimization score |
| `LatencyTracker` | `class` | Maintains latency history, computes trends (`getTrend()`), average scores (`getAverageScore()`), and history retrieval (`getHistory()`) |

### Types

#### LatencyBudget

| Field | Type | Description |
|-------|------|-------------|
| `p50` | `number?` | Maximum allowed P50 latency in ms |
| `p90` | `number?` | Maximum allowed P90 latency in ms |
| `p99` | `number?` | Maximum allowed P99 latency in ms |
| `maxTurn` | `number?` | Maximum allowed per-turn latency in ms |
| `total` | `number?` | Maximum allowed total trajectory latency in ms |
| `components` | `ComponentBudget?` | Per-component budget thresholds |

#### LatencyResult

| Field | Type | Description |
|-------|------|-------------|
| `turns` | `TurnLatency[]` | Per-turn latency breakdown |
| `totalLatencyMs` | `number` | Sum of all agent turn latencies |
| `avgLatencyMs` | `number` | Mean latency across agent turns |
| `p50Ms` | `number` | 50th percentile |
| `p90Ms` | `number` | 90th percentile |
| `p99Ms` | `number` | 99th percentile |
| `maxLatencyMs` | `number` | Maximum single-turn latency |
| `minLatencyMs` | `number` | Minimum single-turn latency |
| `turnCount` | `number` | Number of agent turns evaluated |

#### LatencyViolation

| Field | Type | Description |
|-------|------|-------------|
| `type` | `ViolationType` | Category (`p50_exceeded`, `p90_exceeded`, `p99_exceeded`, `max_turn_exceeded`, `total_exceeded`, `llm_call_exceeded`, `tool_invocation_exceeded`, `overhead_exceeded`) |
| `severity` | `'low' \| 'medium' \| 'high' \| 'critical'` | Impact level of the violation |
| `description` | `string` | Human-readable violation description |
| `actual` | `number` | Measured value in ms |
| `threshold` | `number` | Budget threshold in ms |
| `turnId` | `number?` | Affected turn (for max_turn violations) |

#### ComponentBreakdown

| Field | Type | Description |
|-------|------|-------------|
| `avgLlmCallMs` | `number` | Average LLM call latency across turns |
| `avgToolInvocationMs` | `number` | Average tool invocation latency across turns |
| `avgOverheadMs` | `number` | Average system overhead across turns |
| `totalLlmCallMs` | `number` | Sum of all LLM call latencies |
| `totalToolInvocationMs` | `number` | Sum of all tool invocation latencies |
| `totalOverheadMs` | `number` | Sum of all overhead latencies |

### Latency Presets

| Preset | P50 | P90 | P99 | Max Turn | Trajectory Total |
|--------|-----|-----|-----|----------|-------------------|
| `strict` | 500ms | 1000ms | 2000ms | 3000ms | 15000ms |
| `moderate` | 1000ms | 2000ms | 5000ms | 8000ms | 30000ms |
| `lenient` | 2000ms | 4000ms | 10000ms | 15000ms | 60000ms |

### Advanced: Component-Level SLA Enforcement

Each preset also includes per-component budgets. Pass a custom `LatencyBudget` with a `components` field to enforce LLM call, tool invocation, and overhead thresholds independently:

```typescript
import { enforceBudget } from '@reaatech/agent-eval-harness-latency';

const budget = createLatencyBudget('strict');
// budget.components = { llmCall: 400, toolInvocation: 100, overhead: 50 }

const result = monitorLatency(trajectory);
const enforcement = enforceBudget(result, budget);

for (const v of enforcement.violations) {
  console.log(`[${v.severity.toUpperCase()}] ${v.type}: ${v.description}`);
}

// Enforcement score: 1.0 = perfect, deducts 0.4 for critical, 0.25 for high, etc.
console.log(`Enforcement score: ${enforcement.score}`);
```

### Advanced: Optimization Analysis

The optimizer identifies the most impactful bottlenecks and generates actionable, priority-ranked recommendations:

```typescript
import { analyzeOptimization, LatencyTracker } from '@reaatech/agent-eval-harness-latency';

const optimization = analyzeOptimization(latencyResult, trajectory);

console.log(`Bottlenecks: ${optimization.bottlenecks.length}`);
for (const b of optimization.bottlenecks) {
  console.log(`  ${b.type}: severity=${b.severity.toFixed(2)}, ${b.description}`);
}

console.log(`Top recommendations:`);
for (const r of optimization.recommendations.slice(0, 3)) {
  console.log(`  [${r.priority}] ${r.description} (effort: ${r.effort}, est. gain: ${r.expectedImprovementMs}ms)`);
}

// Track latency across multiple evaluation runs
const tracker = new LatencyTracker();
tracker.record(result);
console.log(`Trend: ${tracker.getTrend().improving ? 'improving' : 'degrading'}`);
console.log(`Average score: ${tracker.getAverageScore()}`);
```

## Related Packages

| Package | Description |
|---------|-------------|
| [@reaatech/agent-eval-harness-types](https://www.npmjs.com/package/@reaatech/agent-eval-harness-types) | Shared domain types and schemas |
| [@reaatech/agent-eval-harness-trajectory](https://www.npmjs.com/package/@reaatech/agent-eval-harness-trajectory) | Trajectory evaluation |
| [@reaatech/agent-eval-harness-tool-use](https://www.npmjs.com/package/@reaatech/agent-eval-harness-tool-use) | Tool-use validation |
| [@reaatech/agent-eval-harness-cost](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cost) | Cost tracking |
| [@reaatech/agent-eval-harness-latency](https://www.npmjs.com/package/@reaatech/agent-eval-harness-latency) | Latency monitoring |
| [@reaatech/agent-eval-harness-judge](https://www.npmjs.com/package/@reaatech/agent-eval-harness-judge) | LLM-as-judge |
| [@reaatech/agent-eval-harness-golden](https://www.npmjs.com/package/@reaatech/agent-eval-harness-golden) | Golden trajectories |
| [@reaatech/agent-eval-harness-suite](https://www.npmjs.com/package/@reaatech/agent-eval-harness-suite) | Suite runner |
| [@reaatech/agent-eval-harness-gate](https://www.npmjs.com/package/@reaatech/agent-eval-harness-gate) | CI gates |
| [@reaatech/agent-eval-harness-mcp-server](https://www.npmjs.com/package/@reaatech/agent-eval-harness-mcp-server) | MCP server |
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | CLI |
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | Observability |

## License

MIT
