# Skill: Latency Budgets

## What It Is

Latency budget enforcement monitors per-turn and end-to-end response times, checking against SLA thresholds (p50, p90, p99). It identifies bottlenecks (4 types: LLM, tool, overhead, total), detects anomalies, and provides optimization recommendations (10 types).

## Why It Matters

- **User Experience** — Slow responses frustrate users
- **SLA Compliance** — Meet contractual performance guarantees
- **Bottleneck Detection** — Identify slow components (LLM, tools, network)
- **Capacity Planning** — Understand performance at scale

## How to Use It

### Monitor Latency

```typescript
import { monitorLatency, createLatencyBudget } from '@reaatech/agent-eval-harness';

// 3 presets: strict, moderate, lenient
const budget = createLatencyBudget('moderate');

// monitorLatency(trajectory: Trajectory): LatencyResult
const result = monitorLatency(trajectory);

console.log(`P50 Latency: ${result.p50Ms}ms`);
console.log(`P90 Latency: ${result.p90Ms}ms`);
console.log(`P99 Latency: ${result.p99Ms}ms`);
console.log(`Total: ${result.totalLatencyMs}ms`);
```

### SLA Enforcement

```typescript
import { enforceBudget } from '@reaatech/agent-eval-harness';

// enforceBudget(trajectory, budget): EnforcementResult
const enforcement = enforceBudget(trajectory, budget);

console.log(`SLA Violations: ${enforcement.violations.length}`);
for (const v of enforcement.violations) {
  console.log(`  ${v.type}: ${v.actual}ms > ${v.threshold}ms`);
}
```

### Optimization Analysis

```typescript
import { analyzeOptimization, LatencyTracker } from '@reaatech/agent-eval-harness';

// analyzeOptimization(trajectory): OptimizationResult
const optimization = analyzeOptimization(trajectory);
console.log(`Bottlenecks: ${optimization.bottlenecks.length}`);
console.log(`Recommendations: ${optimization.recommendations.map(r => r.type)}`);

// Track latency trends over time
const tracker = new LatencyTracker();
tracker.recordRun('eval-1', result);
const trends = tracker.getTrends();
```

## Key Metrics

| Metric | Description | Typical Target |
|--------|-------------|----------------|
| `p50_ms` | Median latency | <1000ms |
| `p90_ms` | 90th percentile | <2000ms |
| `p99_ms` | 99th percentile | <5000ms |
| `trajectory_total_ms` | End-to-end time | <30000ms |

## Latency Presets

| Preset | P50 | P90 | P99 | Trajectory Total |
|--------|-----|-----|-----|------------------|
| `strict` | 500ms | 1000ms | 2000ms | 15s |
| `moderate` | 1000ms | 2000ms | 5000ms | 30s |
| `lenient` | 2000ms | 4000ms | 10000ms | 60s |

## Component Breakdown

| Component | Description | Typical Budget |
|-----------|-------------|----------------|
| `llm_call` | LLM API response time | 800ms |
| `tool_invocation` | Tool execution time | 200ms |
| `overhead` | Network + serialization | 100ms |

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
