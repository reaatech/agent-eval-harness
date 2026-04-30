# @reaatech/agent-eval-harness-suite

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-suite)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-suite)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml)](https://github.com/reaatech/agent-eval-harness/actions)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Orchestrated evaluation suite runner with results aggregation and run comparison. Executes multi-metric evaluations across trajectory batches with configurable concurrency, YAML-driven configuration, and statistical comparison between runs.

## Installation

```bash
npm install @reaatech/agent-eval-harness-suite
```

## Feature Overview

- **Batch evaluation** — run evaluations across hundreds of trajectories with configurable parallel workers
- **YAML-driven config** — declare metrics, judge models, budget limits, and gate configs in a single file
- **Multi-metric scoring** — aggregates faithfulness, relevance, tool correctness, cost, latency, coherence, and goal completion into an overall score
- **Results aggregation** — exports to JSON, JUnit XML, CSV, and Markdown with per-metric breakdowns
- **Run comparison** — statistical comparison between baseline and candidate runs with regression detection
- **Threshold checking** — validate results against configurable per-metric thresholds
- **Progress tracking** — real-time progress callbacks for long-running suites

## Quick Start

```typescript
import { SuiteRunner, parseConfig, createResultsAggregator } from '@reaatech/agent-eval-harness-suite';
import { evaluate } from '@reaatech/agent-eval-harness-trajectory';
import type { Trajectory } from '@reaatech/agent-eval-harness-types';

const config = parseConfig(`
metrics:
  - faithfulness
  - relevance
  - cost
  - latency
judge_model: claude-opus
budget_limit: 10.00
parallel_workers: 4
`);

const runner = new SuiteRunner(config);
const result = await runner.run(trajectories, evaluate);
console.log(`Overall: ${result.overallMetrics.overallScore}, Pass rate: ${result.summary.passRate}`);
```

## API Reference

### Suite Runner

| Name | Type | Description |
|------|------|-------------|
| `SuiteRunner` | `class` | Orchestrates batch evaluation with configurable concurrency, timeout, error handling, and progress callbacks |
| `createSuiteRunner(config?)` | `function` | Factory: returns a new `SuiteRunner` instance with optional partial config |

`SuiteRunner` constructor accepts `config?: Partial<SuiteRunnerConfig>` and an optional `progressCallback`. The `run(trajectories, evaluator)` method executes evaluations in concurrent batches and returns `EvalRunResult`.

### Configuration

| Name | Type | Description |
|------|------|-------------|
| `parseConfig(yamlString)` | `function` | Parse a YAML configuration string into a `SuiteConfig` object |
| `validateConfig(config)` | `function` | Validate a `SuiteConfig`; returns `{ valid, errors }` — checks weights sum to 1.0, threshold ranges, required fields |
| `createDefaultConfig(name)` | `function` | Create a default `SuiteConfig` with all five standard metrics pre-configured |
| `mergeConfig(partial)` | `function` | Merge a partial config object with sensible defaults |
| `calculateOverallScore(metricScores, config)` | `function` | Weighted composite score from per-metric scores using config weights |
| `checkThresholds(metricScores, config)` | `function` | Verify all enabled metric thresholds are met; returns `{ passed, failures }` |

### Results Aggregation

| Name | Type | Description |
|------|------|-------------|
| `ResultsAggregator` | `class` | Aggregates raw run results into structured breakdowns with export methods |
| `createResultsAggregator(config)` | `function` | Factory: returns a new `ResultsAggregator` for the given `SuiteConfig` |

`ResultsAggregator` methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `aggregate(runResult)` | `AggregatedResults` | Compute per-metric breakdowns, trajectory results, and summary statistics |
| `exportJSON(results)` | `string` | Export aggregated results as formatted JSON |
| `exportJUnit(results)` | `string` | Export as JUnit XML for CI test reporters |
| `exportCSV(results)` | `string` | Export as CSV with one row per trajectory |
| `exportMarkdown(results)` | `string` | Export as Markdown with summary table and per-metric breakdown |
| `export(results, format)` | `string` | Export in any supported format (`'json'` \| `'junit'` \| `'csv'` \| `'markdown'`) |

### Run Comparison

| Name | Type | Description |
|------|------|-------------|
| `RunComparator` | `class` | Statistical comparison engine for two evaluation runs |
| `createRunComparator(significanceLevel?, minEffectSize?)` | `function` | Factory with configurable significance alpha (default 0.05) and minimum effect size (default 0.1) |

`RunComparator` methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `compare(baseline, candidate)` | `RunComparisonResult` | Full comparison with metric diffs, statistical significance, regressions, improvements, and verdict |
| `generateVisualizationData(comparison)` | `VisualizationData` | Generate bar chart, waterfall, and heatmap data for chart rendering |

### Types

| Name | Type | Description |
|------|------|-------------|
| `SuiteConfig` | `interface` | Top-level suite configuration: `name`, `metrics`, `judge`, `goldenPath`, `baseline`, `output` |
| `MetricConfig` | `interface` | Per-metric config: `name`, `enabled`, `weight`, `threshold`, `config` |
| `JudgeConfig` | `interface` | Judge settings: `model`, `provider`, `budgetLimit`, `calibrationEnabled` |
| `OutputConfig` | `interface` | Output settings: `formats`, `directory`, `includeDetails` |
| `SuiteRunnerConfig` | `interface` | Runtime config: `concurrency`, `continueOnError`, `timeoutMs`, `metrics` |
| `EvalRunResult` | `interface` | Full run result: `runId`, `status`, `totalTrajectories`, `trajectoryResults[]`, `overallMetrics`, `durationMs` |
| `OverallMetrics` | `interface` | Aggregate scores: `overallScore`, `avgFaithfulness`, `avgRelevance`, `toolCorrectnessRate`, `avgCostPerTask`, `latencyP50/P90/P99`, `slaViolations` |
| `ProgressUpdate` | `interface` | Real-time progress: `runId`, `status`, `progress`, `completed`, `total`, `currentTrajectory` |
| `AggregatedResults` | `interface` | Full aggregation: `runId`, `config`, `overallMetrics`, `metricBreakdown`, `trajectoryResults[]`, `summary`, `timestamp` |
| `MetricBreakdown` | `interface` | Per-metric stats: `name`, `avgScore`, `minScore`, `maxScore`, `stdDev`, `passRate`, `weight` |
| `TrajectoryResult` | `interface` | Per-trajectory: `trajectoryId`, `overallScore`, `metricScores`, `passed`, `errors` |
| `SummaryStatistics` | `interface` | Aggregate counts: `totalTrajectories`, `passedTrajectories`, `failedTrajectories`, `passRate`, `overallPassed`, `durationMs` |
| `RunComparisonResult` | `interface` | Comparison output: `scoreDiff`, `metricDiffs[]`, `statisticalSignificance`, `regressions[]`, `improvements[]`, `summary` |
| `MetricDiff` | `interface` | Per-metric change: `metric`, `baseline`, `candidate`, `diff`, `percentChange`, `effectSize` (Cohen's d) |
| `StatisticalResult` | `interface` | Significance test: `test`, `pValue`, `confidenceInterval`, `significant`, `alpha` |

## Related Packages

| Package | Description |
|---------|-------------|
| [@reaatech/agent-eval-harness-types](https://www.npmjs.com/package/@reaatech/agent-eval-harness-types) | Shared domain types and Zod schemas |
| [@reaatech/agent-eval-harness-trajectory](https://www.npmjs.com/package/@reaatech/agent-eval-harness-trajectory) | Trajectory loading, evaluation, and golden comparison |
| [@reaatech/agent-eval-harness-tool-use](https://www.npmjs.com/package/@reaatech/agent-eval-harness-tool-use) | Tool-use validation and schema compliance |
| [@reaatech/agent-eval-harness-cost](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cost) | Cost tracking, budgets, and reporting |
| [@reaatech/agent-eval-harness-latency](https://www.npmjs.com/package/@reaatech/agent-eval-harness-latency) | Latency monitoring, SLA enforcement, and optimization |
| [@reaatech/agent-eval-harness-judge](https://www.npmjs.com/package/@reaatech/agent-eval-harness-judge) | LLM-as-judge with calibration and consensus |
| [@reaatech/agent-eval-harness-golden](https://www.npmjs.com/package/@reaatech/agent-eval-harness-golden) | Golden trajectory management and curation |
| [@reaatech/agent-eval-harness-suite](https://www.npmjs.com/package/@reaatech/agent-eval-harness-suite) | Suite runner, results aggregation, and comparison |
| [@reaatech/agent-eval-harness-gate](https://www.npmjs.com/package/@reaatech/agent-eval-harness-gate) | CI regression gates with JUnit and GitHub output |
| [@reaatech/agent-eval-harness-mcp-server](https://www.npmjs.com/package/@reaatech/agent-eval-harness-mcp-server) | MCP server with three-layer tool architecture |
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | Command-line interface |
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | OTel tracing, metrics, structured logging, and dashboards |

## License

[MIT](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
