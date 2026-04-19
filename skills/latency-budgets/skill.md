# Skill: Latency Budgets

## What It Is

Latency budget enforcement monitors per-turn and end-to-end response times, checking against SLA thresholds (p50, p90, p99). It identifies bottlenecks and ensures agents meet performance requirements.

## Why It Matters

- **User Experience** — Slow responses frustrate users
- **SLA Compliance** — Meet contractual performance guarantees
- **Bottleneck Detection** — Identify slow components (LLM, tools, network)
- **Capacity Planning** — Understand performance at scale

## How to Use It

### Monitor Latency

```bash
npx agent-eval-harness eval trajectories/*.jsonl \
  --latency-budget p99:5000 \
  --output results/
```

### Latency Analysis

```typescript
import { monitorLatency, createLatencyBudget } from 'agent-eval-harness';

const budget = createLatencyBudget({
  per_turn_p50: 1000,
  per_turn_p90: 2000,
  per_turn_p99: 5000,
  trajectory_total: 30000,
});

const result = await monitorLatency('trajectories/run.jsonl', budget);

console.log(`P50 Latency: ${result.p50_ms}ms`);
console.log(`P90 Latency: ${result.p90_ms}ms`);
console.log(`P99 Latency: ${result.p99_ms}ms`);
console.log(`SLA Violations: ${result.violations.length}`);
```

### Component Breakdown

```typescript
const breakdown = result.componentBreakdown;

console.log('Latency by Component:');
console.log(`  LLM Calls: ${breakdown.llm_call_ms}ms`);
console.log(`  Tool Invocations: ${breakdown.tool_invocation_ms}ms`);
console.log(`  Overhead: ${breakdown.overhead_ms}ms`);
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `p50_ms` | Median latency | <1000ms |
| `p90_ms` | 90th percentile | <2000ms |
| `p99_ms` | 99th percentile | <5000ms |
| `trajectory_total_ms` | End-to-end time | <30000ms |
| `sla_violations` | Count of violations | 0 |

## Best Practices

1. **Set realistic budgets** — Based on user expectations and technical constraints
2. **Monitor all percentiles** — p50, p90, and p99 tell different stories
3. **Track component latency** — Identify which part is slow
4. **Set SLA alerts** — Get notified when violations occur
5. **Optimize iteratively** — Focus on the biggest bottlenecks first

## Common Pitfalls

- **Only tracking averages** — Averages hide tail latency issues
- **Ignoring component breakdown** — Can't optimize what you don't measure
- **No trajectory-level monitoring** — End-to-end time matters most
- **Unrealistic budgets** — Set achievable targets based on data

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [Cost Tracking](../cost-tracking/skill.md)
- [Eval Gating](../eval-gating/skill.md)
