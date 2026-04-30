# Skill: Eval Gating

## What It Is

Eval gating uses evaluation results to make pass/fail decisions in CI/CD pipelines. It checks metrics against thresholds and baselines using 4 gate types (threshold, baseline-comparison, regression, custom) with 6 comparison operators. Blocks deployments when quality standards aren't met.

## Why It Matters

- **Quality Gates** — Prevent regressions from reaching production
- **Automated Decisions** — Remove manual quality review bottlenecks
- **Fast Feedback** — Catch issues before merge
- **Consistent Standards** — Apply the same criteria to every change

## How to Use It

### CLI: Run Gate Check

```bash
npx agent-eval-harness gate results/results.json \
  --preset standard \
  --exit-code
```

### Gate Configuration (YAML)

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

### Gate Presets

Three named presets for quick setup:

| Preset | Overall Quality | Cost | Latency P99 | Tool Correctness | Faithfulness |
|--------|----------------|------|-------------|------------------|--------------|
| **standard** | >= 0.80 | <= $0.05 | <= 5000ms | >= 0.95 | >= 0.85 |
| **strict** | >= 0.90 | <= $0.03 | <= 3000ms | >= 0.98 | >= 0.90 |
| **lenient** | >= 0.70 | <= $0.10 | <= 10000ms | >= 0.85 | >= 0.75 |

### Programmatic Gate Evaluation

```typescript
import {
  createGateEngine,
  getStandardPreset,
  getStrictPreset,
  getLenientPreset,
  CIIntegration,
} from '@reaatech/agent-eval-harness';

// Use a preset
const presets = getStandardPreset();
const engine = createGateEngine(presets.gates);

// Or build custom gates
const engine2 = createGateEngine([
  { name: 'quality', type: 'threshold', metric: 'overall_score',
    operator: '>=', threshold: 0.80 },
  { name: 'cost', type: 'threshold', metric: 'avg_cost_per_task',
    operator: '<=', threshold: 0.05 },
]);

// evaluate() is synchronous
const summary = engine.evaluate(aggregatedResults);

if (summary.overallPassed) {
  console.log('All gates passed');
  process.exit(0);
} else {
  console.log('Gates failed:');
  for (const r of summary.results.filter(r => !r.passed)) {
    console.log(`  ${r.name}: ${r.actualValue} (threshold: ${r.threshold})`);
  }
  process.exit(1);
}
```

### Custom Gate Factories

```typescript
import {
  createOverallQualityGate,
  createCostGate,
  createLatencyGate,
  createFaithfulnessGate,
  createToolCorrectnessGate,
  createNoRegressionGate,
  createPassRateGate,
  createSLAViolationsGate,
  createImprovementGate,
  createSignificanceGate,
  createMetricRegressionGate,
} from '@reaatech/agent-eval-harness';

const gates = [
  createOverallQualityGate(0.85),
  createCostGate(0.05),
  createLatencyGate(5000),
  createNoRegressionGate(baselineResults, 'overall_score'),
];

const engine = createGateEngine(gates);
```

### CI Integration

```typescript
import {
  CIIntegration,
  writeJUnitReport,
  outputGitHubAnnotations,
  setGitHubOutput,
  exportForCI,
} from '@reaatech/agent-eval-harness';

const summary = engine.evaluate(results);

// GitHub Annotations for PR
const annotations = CIIntegration.generateGitHubAnnotations(summary);
annotations.forEach(a => console.log(a));

// JUnit XML for test reporters
writeJUnitReport(summary, './reports/gates.xml');

// GitHub Actions step outputs
setGitHubOutput(summary);

// Get CI exit code (0 = pass, 1 = failure)
const exitCode = CIIntegration.getExitCode(summary);
process.exit(exitCode);

// Full CI export (annotations + JUnit + outputs + env vars)
exportForCI(summary, './reports/', process.env);
```

### GitHub Actions Workflow

```yaml
name: Agent Evaluation
on:
  pull_request:
    branches: [main]
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run evaluation
        run: |
          npx agent-eval-harness eval trajectories/*.jsonl \
            --config eval-config.yaml \
            --output results/

      - name: Check gates
        run: |
          npx agent-eval-harness gate results/results.json \
            --preset standard \
            --exit-code

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: results/
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

1. **Threshold Gates** — Check metric against fixed value with comparison operators (`>=`, `<=`, `>`, `<`, `==`, `!=`)
2. **Baseline-Comparison Gates** — Compare against previous run with regression/improvement detection
3. **Regression Gates** — Detect specific metric regressions from a baseline
4. **Custom Gates** — Arbitrary evaluation functions returning pass/fail

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
