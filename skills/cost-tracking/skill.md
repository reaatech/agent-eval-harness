# Skill: Cost Tracking

## What It Is

Cost tracking calculates per-task and per-trajectory expenses, including LLM API costs, tool invocation costs, and judge evaluation costs. It enforces budgets and provides cost optimization insights.

## Why It Matters

- **Budget Control** — Prevent runaway API costs
- **Cost Optimization** — Identify expensive patterns
- **ROI Analysis** — Measure cost vs. quality tradeoffs
- **Alerting** — Get notified before budgets are exceeded

## How to Use It

### Track Costs

```bash
npx agent-eval-harness eval trajectories/*.jsonl \
  --budget 10.00 \
  --output results/
```

### Cost Breakdown

```typescript
import { calculateTrajectoryCost } from 'agent-eval-harness';

const pricing = {
  'claude-opus': { input: 15.00, output: 75.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
};

const breakdown = await calculateTrajectoryCost('trajectories/run.jsonl', pricing);

console.log(`Total Cost: $${breakdown.total_cost}`);
console.log(`LLM Calls: $${breakdown.llm_calls}`);
console.log(`Tool Invocations: $${breakdown.tool_invocations}`);
console.log(`Judge Evaluations: $${breakdown.judge_evaluations}`);
```

### Budget Alerts

```typescript
import { checkBudget, createBudget } from 'agent-eval-harness';

const budget = createBudget({
  per_task: 0.05,
  per_trajectory: 1.00,
  daily: 100.00,
  alerts: [
    { threshold: 0.5, action: 'log' },
    { threshold: 0.75, action: 'notify' },
    { threshold: 0.9, action: 'block' },
  ],
});

const status = await checkBudget(currentSpend, budget);
if (!status.within_budget) {
  console.warn(`Budget exceeded: ${status.percentage}% used`);
}
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
