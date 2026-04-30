# Skill: Regression Suites

## What It Is

Regression suites orchestrate comprehensive evaluation runs across multiple trajectories, comparing results against baselines to detect quality degradation. They provide statistical significance testing (t-test, Cohen's d), trend analysis, and multi-format result export (JSON, JUnit, CSV, Markdown).

## Why It Matters

- **Automated Regression Detection** — Catch quality issues before production
- **Statistical Rigor** — Distinguish real changes from noise
- **Trend Analysis** — Track quality over time
- **CI Integration** — Block releases with quality gates

## How to Use It

### CLI: Run Evaluation Suite

```bash
# Full eval suite
npx agent-eval-harness eval trajectories/*.jsonl \
  --config eval-config.yaml \
  --golden golden/ \
  --judge-model claude-opus \
  --output results/

# Compare two runs
npx agent-eval-harness compare results/baseline.json results/candidate.json \
  --statistical \
  --format markdown \
  --output comparison.md
```

### Programmatic Suite Runner

```typescript
import { createSuiteRunner, ResultsAggregator, createResultsAggregator } from '@reaatech/agent-eval-harness';

const runner = createSuiteRunner({
  concurrency: 5,
  timeoutPerTrajectory: 60000,
  continueOnError: true,
});

const result = await runner.run(trajectories, async (trajectory) => ({
  trajectory_id: trajectory.trajectory_id,
  overall_score: 0.85,
  metrics: {},
  timestamp: new Date().toISOString(),
}));

console.log(`Status: ${result.status}`);
console.log(`Completed: ${result.completedTrajectories}/${result.totalTrajectories}`);

// Aggregate results
const aggregator = createResultsAggregator(config);
const aggregated = aggregator.aggregate(result);

console.log(`Overall: ${aggregated.overallMetrics.overallScore}`);
console.log(`Pass Rate: ${aggregated.summary.passRate}`);

// Export in various formats
const json = aggregator.exportJSON(aggregated);
const junit = aggregator.exportJUnit(aggregated);
const csv = aggregator.exportCSV(aggregated);
const md = aggregator.exportMarkdown(aggregated);
```

### Compare Two Runs

```typescript
import { createRunComparator } from '@reaatech/agent-eval-harness';

const comparator = createRunComparator();
const diff = comparator.compare(baselineResults, candidateResults);

console.log(`Score Diff: ${diff.scoreDiff > 0 ? '+' : ''}${diff.scoreDiff}`);
console.log(`Verdict: ${diff.summary.verdict}`);
console.log(`Statistically Significant: ${diff.statisticalSignificance?.isSignificant}`);

console.log(`Regressions: ${diff.regressions.length}`);
console.log(`Improvements: ${diff.improvements.length}`);

for (const r of diff.regressions) {
  console.log(`  ${r.metric}: ${r.baselineValue} → ${r.currentValue} (${r.effectSize})`);
}
```

### Suite Configuration

```typescript
import { parseConfig, validateConfig, createDefaultConfig, calculateOverallScore } from '@reaatech/agent-eval-harness';

// Parse YAML config
const config = parseConfig('eval-config.yaml');
const valid = validateConfig(config);

// Or create programmatically
const defaultConfig = createDefaultConfig('my-run');

// Calculate weighted overall score
const score = calculateOverallScore(metrics, config.metrics);
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `score_diff` | Quality delta from baseline | >0 |
| `statistical_significance` | p-value for change | <0.05 |
| `regression_count` | Metrics that degraded | 0 |
| `improvement_count` | Metrics that improved | >0 |

## Verdict Types

| Verdict | Condition |
|---------|-----------|
| `improved` | Score increased significantly |
| `regressed` | Score decreased significantly |
| `unchanged` | No significant difference |
| `mixed` | Some metrics improved, others regressed |

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
