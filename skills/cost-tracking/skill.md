# Skill: Cost Tracking

## What It Is

Cost tracking calculates per-task and per-trajectory expenses, including LLM API costs, tool invocation costs, and judge evaluation costs. It enforces budgets with 3-tier alert thresholds (50% log, 75% notify, 90% block) and provides cost optimization insights.

## Why It Matters

- **Budget Control** — Prevent runaway API costs
- **Cost Optimization** — Identify expensive patterns
- **ROI Analysis** — Measure cost vs. quality tradeoffs
- **Alerting** — Get notified before budgets are exceeded

## How to Use It

### CLI: Eval with Budget

```bash
npx agent-eval-harness eval trajectories/*.jsonl \
  --budget 10.00 \
  --output results/
```

### Calculate Trajectory Cost

```typescript
import { calculateTrajectoryCost, DEFAULT_PRICING } from '@reaatech/agent-eval-harness';

// Uses built-in pricing for 8 models (claude-opus, claude-sonnet, claude-haiku,
// gpt-4-turbo, gpt-4, gpt-4-mini, gemini-pro, gemini-flash)
const cost = calculateTrajectoryCost(trajectory, 'claude-opus');

console.log(`Total: $${formatCost(cost.total_cost)}`);
console.log(`LLM Calls: $${formatCost(cost.llm_calls)}`);
console.log(`Tool Invocations: $${formatCost(cost.tool_invocations)}`);
console.log(`Per-turn breakdown:`, cost.per_turn);
```

### Budget Enforcement

```typescript
import { checkBudget, createBudget, CostTracker } from '@reaatech/agent-eval-harness';

// 3 budget presets: strict, moderate, lenient
const budget = createBudget('moderate');

// checkBudget(cost: CostBreakdown, budget: BudgetConfig, thresholds?)
const status = checkBudget(cost, budget);

if (!status.withinBudget) {
  console.warn(`Budget exceeded: ${status.usagePercentage}% used`);
}

// Track cumulative costs
const tracker = new CostTracker({ per_trajectory: 1.00, daily: 100.00 });
tracker.recordCost(cost);
console.log(`Daily total: $${formatCost(tracker.getDailyTotal())}`);
```

### Cost Reporting

```typescript
import {
  generateCostReport,
  exportToCsv,
  exportToJson,
  generateSummary,
  formatCost,
} from '@reaatech/agent-eval-harness';

const report = generateCostReport(trajectories);
console.log(formatCost(report.totalCost));

const csv = exportToCsv(report);
const json = exportToJson(report);
const summary = generateSummary(report);
```

## Key Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| `total_cost` | Total evaluation cost | USD |
| `cost_per_task` | Average cost per task | USD |
| `cost_per_trajectory` | Average cost per trajectory | USD |
| `budget_percentage` | Budget utilization | % |
| `llm_cost` | LLM API costs | USD |
| `tool_cost` | Tool invocation costs | USD |
| `judge_cost` | LLM judge costs | USD |

## Supported Models (DEFAULT_PRICING)

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| claude-opus | $15.00 | $75.00 |
| claude-sonnet | $3.00 | $15.00 |
| claude-haiku | $0.25 | $1.25 |
| gpt-4-turbo | $10.00 | $30.00 |
| gpt-4 | $30.00 | $60.00 |
| gpt-4-mini | $0.15 | $0.60 |
| gemini-pro | $2.50 | $7.50 |
| gemini-flash | $0.50 | $1.50 |

## Budget Presets

| Preset | Per Task | Per Trajectory | Daily |
|--------|----------|----------------|-------|
| `strict` | $0.02 | $0.50 | $50.00 |
| `moderate` | $0.05 | $1.00 | $100.00 |
| `lenient` | $0.10 | $2.00 | $250.00 |

## Best Practices

1. **Set budget limits** — Define per-task, per-trajectory, and daily budgets
2. **Track all costs** — Include LLM, tools, and judge evaluations
3. **Monitor trends** — Watch for cost increases over time
4. **Optimize judge usage** — Use cheaper models for simple evaluations
5. **Set alerts** — Get notified at 50%, 75%, and 90% budget usage

## Common Pitfalls

- **Ignoring judge costs** — LLM-as-judge can be expensive at scale
- **No budget limits** — Costs can spiral without enforcement
- **Missing token counts** — Always track input and output tokens
- **No cost breakdown** — Understand where costs come from

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [LLM Judge](../llm-judge-calibrated/skill.md)
- [Eval Gating](../eval-gating/skill.md)
