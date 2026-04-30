# Skill: Regression Suites

## What It Is

Regression suites orchestrate comprehensive evaluation runs across multiple trajectories, comparing results against baselines to detect quality degradation. They provide statistical significance testing and trend analysis.

## Why It Matters

- **Automated Regression Detection** — Catch quality issues before production
- **Statistical Rigor** — Distinguish real changes from noise
- **Trend Analysis** — Track quality over time
- **CI Integration** — Block releases with quality gates

## How to Use It

### Run Evaluation Suite

```bash
npx agent-eval-harness eval trajectories/*.jsonl \
  --config eval-config.yaml \
  --golden golden/ \
  --judge-model claude-opus \
  --output results/
```

### Compare Runs

```bash
npx agent-eval-harness compare baseline/results.json candidate/results.json \
  --statistical \
  --format markdown \
  --output comparison.md
```

### Programmatic Suite Execution

```typescript
import { RunComparator } from '@reaatech/agent-eval-harness';

const comparator = new RunComparator();
const diff = await comparator.compare('baseline/results.json', 'candidate/results.json');

console.log(`Overall Change: ${(diff.overall_change * 100).toFixed(1)}%`);
console.log(`Statistically Significant: ${diff.significant}`);
console.log(`Regressions: ${diff.regressions.length}`);
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `overall_change` | Quality delta from baseline | >0 |
| `statistical_significance` | p-value for change | <0.05 |
| `regression_count` | Metrics that degraded | 0 |
| `improvement_count` | Metrics that improved | >0 |

## Best Practices

1. **Run on every PR** — Catch regressions early
2. **Use statistical tests** — Don't overreact to noise
3. **Track trends** — Monitor quality over time
4. **Set appropriate baselines** — Update when quality improves
5. **Integrate with CI** — Block merges on regressions

## Common Pitfalls

- **No baseline** — Always compare against something
- **Ignoring statistics** — Small changes may be noise
- **Too few trajectories** — Need sufficient sample size
- **Stale baselines** — Update when quality improves

## Related Skills

- [Golden Trajectories](../golden-trajectories/skill.md)
- [Eval Gating](../eval-gating/skill.md)
- [Trajectory Evaluation](../trajectory-eval/skill.md)
