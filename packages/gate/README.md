# @reaatech/agent-eval-harness-gate

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-gate.svg)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

CI/CD regression gates for AI agent evaluation. Define quality, cost, latency, and correctness thresholds that block merges when agents regress. Outputs JUnit XML for test reporters, GitHub Actions annotations for PR comments, and structured JSON for dashboards.

## Installation

```bash
npm install @reaatech/agent-eval-harness-gate
```

## Feature Overview

- **Threshold gates** — overall quality, faithfulness, relevance, tool correctness, cost, latency, pass rate, SLA violations
- **Baseline comparison gates** — no-regression, improvement-required, statistical significance, per-metric regression
- **Three presets** — standard (quality >= 0.80), strict (quality >= 0.90), lenient (quality >= 0.60)
- **Custom gate functions** — programmatic gates with access to full results and comparison data
- **CI integration** — JUnit XML output, GitHub Actions annotations, step outputs, PR comments
- **Result caching** — configurable TTL caching to speed repeated evaluations

## Quick Start

```typescript
import { createGateEngine, getStandardPreset, CIIntegration } from '@reaatech/agent-eval-harness-gate';

const engine = createGateEngine(getStandardPreset().gates);
const results = await getAggregatedResults();
const summary = engine.evaluate(results);

console.log(`Passed: ${summary.overallPassed}, ${summary.passedGates}/${summary.totalGates} gates`);
console.log(`Exit code: ${CIIntegration.getExitCode(summary)}`);
```

## API Reference

### GateEngine

| Method | Signature | Description |
|--------|-----------|-------------|
| `evaluate` | `(results: AggregatedResults, comparison?: RunComparisonResult) => GateEvaluationSummary` | Evaluate all gates against results |
| `clearCache` | `() => void` | Clear the result cache |
| `getGates` | `() => GateDefinition[]` | Get all registered gates |
| `addGate` | `(gate: GateDefinition) => void` | Add a gate dynamically |
| `removeGate` | `(name: string) => void` | Remove a gate by name |

**Factory:** `createGateEngine(gates: GateDefinition[], cacheTTL?: number): GateEngine`

### Threshold Gate Builders

| Builder | Default | Description |
|---------|---------|-------------|
| `createOverallQualityGate(threshold?)` | `0.8` | Overall quality score >= threshold |
| `createFaithfulnessGate(threshold?)` | `0.8` | Faithfulness score >= threshold |
| `createRelevanceGate(threshold?)` | `0.8` | Relevance score >= threshold |
| `createToolCorrectnessGate(threshold?)` | `0.9` | Tool correctness rate >= threshold |
| `createCostGate(maxCost?)` | `0.05` | Cost per task <= maxCost |
| `createLatencyGate(maxLatencyMs?)` | `5000` | P99 latency <= maxLatencyMs |
| `createPassRateGate(minPassRate?)` | `0.95` | Pass rate >= minPassRate |
| `createSLAViolationsGate(maxViolations?)` | `0` | SLA violations <= maxViolations |
| `buildThresholdGates(config)` | — | Build gates from a config object |

### Presets

| Preset | Function | Quality | Faithfulness | Relevance | Tool Correctness | Cost | Latency P99 | Pass Rate | SLA Violations |
|--------|----------|---------|-------------|-----------|-----------------|------|-------------|-----------|----------------|
| Standard | `getStandardPreset()` | >= 0.80 | >= 0.80 | >= 0.80 | >= 0.90 | <= $0.05 | <= 5000ms | >= 95% | — |
| Strict | `getStrictPreset()` | >= 0.90 | >= 0.90 | >= 0.90 | >= 0.95 | <= $0.02 | <= 2000ms | >= 99% | <= 0 |
| Lenient | `getLenientPreset()` | >= 0.60 | >= 0.60 | >= 0.60 | >= 0.70 | <= $0.10 | <= 10000ms | — | — |

### Baseline Gate Builders

| Builder | Description |
|---------|-------------|
| `createNoRegressionGate()` | Fail if any regression detected vs baseline |
| `createImprovementGate(minImprovement?)` | Require minimum overall score improvement |
| `createSignificanceGate(alpha?)` | Require statistical significance (default α=0.05) |
| `createMetricRegressionGate(metric, allowDecline?)` | Per-metric regression gate with tolerance |
| `getBaselinePreset()` | Returns `[noRegression, improvement(0)]` |
| `getStrictBaselinePreset()` | Returns `[noRegression, improvement(0.05), significance(0.05), metricRegression × 3]` |

### CI Integration

| Export | Type | Description |
|--------|------|-------------|
| `CIIntegration` | Class (static methods) | Generate annotations, JUnit XML, PR comments, env vars |
| `writeJUnitReport(summary, filePath)` | Function | Write JUnit XML to file |
| `outputGitHubAnnotations(summary)` | Function | Print GitHub Actions workflow commands |
| `setGitHubOutput(key, value)` | Function | Set GitHub Actions step output |
| `exportForCI(summary, outputDir)` | Function | Export JUnit XML + JSON results + PR comment |

**CIIntegration static methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `generateGitHubAnnotations(summary)` | `string` | Workflow command string for GitHub Actions |
| `generateJUnitReport(summary)` | `string` | JUnit XML for test reporters |
| `generatePRComment(summary)` | `string` | Markdown table for PR comments |
| `generateStepSummary(summary)` | `string` | Markdown for GitHub Actions step summary |
| `generateEnvVars(summary)` | `Record<string, string>` | Environment variables for CI |
| `getExitCode(summary)` | `number` | 0 if all passed, 1 otherwise |
| `parseGateConfig(yamlString)` | `GateConfig[]` | Parse gate config from YAML |

### Types

**GateDefinition**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Unique gate name |
| `type` | `GateType` | yes | `'threshold'` \| `'baseline-comparison'` \| `'regression'` \| `'custom'` |
| `metric` | `string` | no | Metric to check (for threshold/baseline gates) |
| `operator` | `GateOperator` | no | `'>='` \| `'<='` \| `'>'` \| `'<'` \| `'=='` \| `'!='` |
| `threshold` | `number` | no | Threshold value for comparison |
| `baseline` | `string` | no | Baseline run ID |
| `allowRegression` | `boolean` | no | Whether regression is allowed |
| `customFn` | `(results, comparison?) => GateResult` | no | Custom evaluation function |
| `enabled` | `boolean` | no | Gate enabled flag (default true) |
| `description` | `string` | no | Human-readable description |

**GateResult**

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Gate name |
| `passed` | `boolean` | Whether gate passed |
| `reason` | `string` | Pass/fail reason |
| `actualValue` | `number?` | Actual value observed |
| `expectedValue` | `number?` | Expected/threshold value |
| `type` | `GateType` | Gate type |

**GateEvaluationSummary**

| Field | Type | Description |
|-------|------|-------------|
| `runId` | `string` | Evaluation run ID |
| `totalGates` | `number` | Total gates evaluated |
| `passedGates` | `number` | Gates that passed |
| `failedGates` | `number` | Gates that failed |
| `overallPassed` | `boolean` | All gates passed |
| `results` | `GateResult[]` | Individual gate results |
| `durationMs` | `number` | Evaluation duration |
| `cacheHitRate` | `number?` | Cache hit rate (0-1) |

## Advanced Patterns

### Custom Programmatic Gates

Custom gates have full access to evaluation results and comparison data, enabling arbitrary logic beyond simple thresholds:

```typescript
import { createGateEngine } from '@reaatech/agent-eval-harness-gate';

const customGate: GateDefinition = {
  name: 'composite-quality',
  type: 'custom',
  description: 'Composite gate combining multiple metrics',
  customFn: (results, comparison) => {
    const overall = results.overallMetrics.overallScore;
    const faithfulness = results.metricBreakdown.faithfulness?.avgScore ?? 0;
    const cost = results.metricBreakdown.cost?.avgScore ?? 0;

    const composite = overall * 0.5 + faithfulness * 0.3 + (1 - cost) * 0.2;
    const passed = composite >= 0.75;

    return {
      passed,
      reason: passed
        ? `Composite score ${composite.toFixed(2)} >= 0.75`
        : `Composite score ${composite.toFixed(2)} < 0.75`,
    };
  },
};

const engine = createGateEngine([customGate]);
const summary = engine.evaluate(results);
```

### CI Pipeline Integration

```yaml
# .github/workflows/eval-gates.yml
name: Agent Evaluation Gates

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
            --output results/

      - name: Run regression gates
        id: gates
        run: |
          npx agent-eval-harness gate results/results.json \
            --preset standard \
            --exit-code

      - name: Upload JUnit report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: gate-results
          path: results/

      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const { CIIntegration } = require('@reaatech/agent-eval-harness-gate');
            const results = require('./results/results.json');
            const summary = CIIntegration.evaluateFromResults(results);

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: CIIntegration.generatePRComment(summary)
            });
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
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | CLI |
| [@reaatech/agent-eval-harness-mcp-server](https://www.npmjs.com/package/@reaatech/agent-eval-harness-mcp-server) | MCP server |
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | Observability |

## License

MIT
