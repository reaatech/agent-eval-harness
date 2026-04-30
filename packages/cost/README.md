# @reaatech/agent-eval-harness-cost

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-cost)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cost)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Per-task cost calculation, budget enforcement, and cost reporting for AI agent trajectories. Tracks LLM token usage and tool invocation costs across 8 supported models with configurable pricing and 3-tier budget alerting.

## Installation

```bash
npm install @reaatech/agent-eval-harness-cost
```

## Feature Overview

- **8 built-in model pricings** — Claude Opus/Sonnet/Haiku, GPT-4/Turbo/Mini, Gemini Pro/Flash
- **Per-turn and per-trajectory costing** — granular breakdown with LLM vs tool cost separation
- **Budget enforcement** — 3-tier alert system (50% log, 75% notify, 90% block) with daily cumulative tracking
- **Three budget presets** — strict ($0.01/task), moderate ($0.05/task), lenient ($0.10/task)
- **Cost reporting** — JSON, CSV, and formatted human-readable output
- **Optimization recommendations** — identifies cost reduction opportunities per trajectory

## Quick Start

```typescript
import { calculateTrajectoryCost, checkBudget, createBudget, generateCostReport } from '@reaatech/agent-eval-harness-cost';
import type { Trajectory } from '@reaatech/agent-eval-harness-types';

const cost = calculateTrajectoryCost(trajectory, 'claude-opus');
console.log(`Total: $${cost.total_cost.toFixed(4)}`);

const budget = createBudget('moderate');
const result = checkBudget(cost, budget);
console.log(`Within budget: ${result.within_budget}, Usage: ${result.usage_percentage}%`);
```

## API Reference

### Cost Calculation Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateTurnCost` | `(turn: Turn, provider: string, options?: CostOptions) => TurnCost` | Calculates cost for a single turn. Uses actual token counts from `turn.cost` if present, otherwise estimates from content length. Separates LLM cost (input + output tokens) from tool invocation cost. |
| `calculateTrajectoryCost` | `(trajectory: Trajectory, provider: string, options?: CostOptions) => CostBreakdown` | Calculates cost for an entire trajectory. Aggregates all agent turns, returning a `CostBreakdown` with total, LLM, and tool costs plus `per_turn` breakdown. |
| `compareCosts` | `(baseline: CostBreakdown, candidate: CostBreakdown) => { costDiff, percentageChange, cheaper }` | Compares two cost objects. Returns absolute difference, percentage change, and a `cheaper` boolean indicating if the candidate is less expensive. |
| `getCostPerMetric` | `(cost: CostBreakdown, metric: 'turn' \| 'tool_call' \| 'trajectory', trajectory: Trajectory) => number` | Normalizes cost by the chosen metric. `'turn'` divides by agent turn count, `'tool_call'` divides by total tool calls, `'trajectory'` returns total cost unchanged. |

### Budget Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `checkBudget` | `(cost: CostBreakdown, budget: BudgetConfig, thresholds?: AlertThreshold[]) => BudgetCheckResult` | Checks cost against budget limits. Evaluates `perTrajectory` or `perTask` constraints and triggers alerts at configured thresholds. Default 3-tier thresholds: 50% log, 75% warn, 90% block. |
| `getOptimizationRecommendations` | `(cost: CostBreakdown, trajectory: Trajectory) => string[]` | Analyzes cost breakdown and trajectory structure to suggest optimizations. Checks output/input token ratio, tool cost ratio, expensive turns, and conversation length. |
| `createBudget` | `(preset: 'strict' \| 'moderate' \| 'lenient') => BudgetConfig` | Creates a pre-configured budget. Returns `perTask`, `perTrajectory`, `daily`, and `perToolCall` limits for the requested preset. |

### CostTracker Class

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(dailyBudget?: number) => CostTracker` | Creates a tracker with an optional daily budget for cumulative monitoring. |
| `addTrajectory` | `(cost: CostBreakdown) => BudgetCheckResult` | Adds a trajectory cost to the cumulative total. Triggers alerts at 75% (warning) and 90% (error) of daily budget. |
| `getTotalCost` | `() => number` | Returns the cumulative total cost across all tracked trajectories. |
| `getTrajectoryCount` | `() => number` | Returns the number of trajectories tracked. |
| `reset` | `() => void` | Resets cumulative cost, trajectory count, and alerts. |

### Reporting Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `generateCostReport` | `(trajectories: Array<{ trajectory, cost }>, options?: CostReportOptions) => CostReport` | Generates a full cost report with totals, per-trajectory breakdowns, hourly trends, and top expensive operations. |
| `formatCost` | `(cost: number, currency?: string) => string` | Formats a numeric cost as a currency string (e.g., `"$0.0023"`). Defaults to USD with 4–6 decimal places. |
| `exportToCsv` | `(report: CostReport) => string` | Exports a cost report to CSV format with per-trajectory details. |
| `exportToJson` | `(report: CostReport) => string` | Exports a cost report to pretty-printed JSON. |
| `generateSummary` | `(report: CostReport) => string` | Generates a human-readable summary with total cost, breakdown, and top expensive operations. |

### Constants

#### DEFAULT_PRICING

Per-million-token pricing for all 8 built-in models:

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|--------------------|----------------------|
| `claude-opus` | $15.00 | $75.00 |
| `claude-sonnet` | $3.00 | $15.00 |
| `claude-haiku` | $0.25 | $1.25 |
| `gpt-4-turbo` | $10.00 | $30.00 |
| `gpt-4` | $30.00 | $60.00 |
| `gpt-4-mini` | $3.00 | $10.00 |
| `gemini-pro` | $2.50 | $7.50 |
| `gemini-flash` | $0.075 | $0.30 |

### Types

#### ProviderPricing

```typescript
interface ProviderPricing {
  input: number;   // cost per million input tokens
  output: number;  // cost per million output tokens
}
```

#### CostOptions

```typescript
interface CostOptions {
  customPricing?: Record<string, ProviderPricing>;  // override or extend DEFAULT_PRICING
  includeToolCosts?: boolean;                        // default: true — include tool invocation costs
  toolInvocationCost?: number;                       // default: 0.0001 — cost per tool call
}
```

#### TrackerTurnCost

```typescript
interface TurnCost {
  turn_id: number;
  cost: number;          // same as total_cost
  llm_cost: number;      // LLM token cost for this turn
  tool_cost: number;     // tool invocation cost for this turn
  total_cost: number;    // llm_cost + tool_cost
  input_tokens?: number;
  output_tokens?: number;
}
```

#### BudgetConfig

```typescript
interface BudgetConfig {
  perTask?: number;        // max cost per individual turn
  perTrajectory?: number;  // max cost per trajectory
  daily?: number;          // max cumulative cost per day
  perToolCall?: number;    // max cost per tool call
}
```

#### BudgetCheckResult

```typescript
interface BudgetCheckResult {
  withinBudget: boolean;      // true if all checks pass
  currentCost: number;        // the cost being checked
  budgetLimit: number;        // the applicable budget limit
  usagePercentage: number;    // percentage of budget consumed (0–100+)
  alerts: BudgetAlert[];      // triggered alerts
  recommendations: string[];  // cost-reduction suggestions
}
```

#### BudgetAlert

```typescript
interface BudgetAlert {
  level: 'info' | 'warning' | 'error';
  message: string;
  threshold: number;
  current: number;
  action: 'log' | 'warn' | 'block';
}
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
