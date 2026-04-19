# Skill: Eval Gating

## What It Is

Eval gating uses evaluation results to make pass/fail decisions in CI/CD pipelines. It checks metrics against thresholds and baselines, blocking deployments when quality standards aren't met.

## Why It Matters

- **Quality Gates** — Prevent regressions from reaching production
- **Automated Decisions** — Remove manual quality review bottlenecks
- **Fast Feedback** — Catch issues before merge
- **Consistent Standards** — Apply the same criteria to every change

## How to Use It

### Run Gate Evaluation

```bash
npx agent-eval-harness gate \
  --results results/eval-123.json \
  --gates gates.yaml \
  --baseline results/baseline.json
```

### Gate Configuration

```yaml
# gates.yaml
gates:
  - name: overall-quality
    type: threshold
    metric: overall_score
    operator: ">="
    threshold: 0.80

  - name: cost-per-task
    type: threshold
    metric: avg_cost_per_task
    operator: "<="
    threshold: 0.05

  - name: latency-p99
    type: threshold
    metric: latency_p99_ms
    operator: "<="
    threshold: 5000

  - name: no-regression
    type: baseline-comparison
    baseline: results/baseline.json
    metric: overall_score
    allow_regression: false

  - name: tool-correctness
    type: threshold
    metric: tool_correctness_rate
    operator: ">="
    threshold: 0.95

  - name: faithfulness
    type: threshold
    metric: avg_faithfulness_score
    operator: ">="
    threshold: 0.85
```

### Programmatic Gate Evaluation

```typescript
import { createGateEngine } from 'agent-eval-harness';

const engine = createGateEngine([
  { name: 'quality', metric: 'overall_score', operator: '>=', threshold: 0.80 },
  { name: 'cost', metric: 'avg_cost_per_task', operator: '<=', threshold: 0.05 },
]);

const result = await engine.evaluate(aggregatedResults);

if (result.passed) {
  console.log('✅ All gates passed');
  process.exit(0);
} else {
  console.log('❌ Gates failed:');
  for (const failure of result.failures) {
    console.log(`  - ${failure.gate}: ${failure.actual} (expected ${failure.expected})`);
  }
  process.exit(1);
}
```

### CI Integration

```yaml
# .github/workflows/ci.yml
- name: Run evaluation
  run: npx agent-eval-harness eval trajectories/*.jsonl --output results/

- name: Check gates
  run: |
    npx agent-eval-harness gate \
      --results results/eval.json \
      --gates gates.yaml \
      --baseline results/baseline.json
```

## Key Metrics

| Metric | Description | Typical Threshold |
|--------|-------------|-------------------|
| `overall_score` | Combined quality | >= 0.80 |
| `cost_per_task` | Average task cost | <= $0.05 |
| `latency_p99` | 99th percentile latency | <= 5000ms |
| `tool_correctness` | Tool usage accuracy | >= 0.95 |
| `faithfulness` | Context adherence | >= 0.85 |

## Gate Types

1. **Threshold Gates** — Check metric against fixed threshold
2. **Baseline Gates** — Compare against previous run
3. **Statistical Gates** — Require statistical significance
4. **Composite Gates** — Combine multiple metrics

## Best Practices

1. **Start conservative** — Set thresholds you're confident about
2. **Use multiple gates** — Cover quality, cost, and performance
3. **Update baselines** — When quality improves, raise the bar
4. **Monitor false positives** — Adjust thresholds if gates are too strict
5. **Document rationale** — Explain why each gate exists

## Common Pitfalls

- **Too many gates** — Start with critical metrics only
- **Unrealistic thresholds** — Set achievable targets
- **No baseline** — Always have something to compare against
- **Ignoring trends** — Consider directional changes

## Related Skills

- [Regression Suites](../regression-suites/skill.md)
- [Golden Trajectories](../golden-trajectories/skill.md)
- [Cost Tracking](../cost-tracking/skill.md)
- [Latency Budgets](../latency-budgets/skill.md)
