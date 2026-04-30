# @reaatech/agent-eval-harness-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-observability.svg)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

OpenTelemetry tracing, metrics collection, structured logging, and in-memory dashboards for agent evaluation pipelines. Provides 7 pre-configured OTel instruments, Pino-based structured logging with automatic PII redaction, and a 24-hour dashboard manager with trend analysis and alerting.

## Installation

```bash
npm install @reaatech/agent-eval-harness-observability
# or
pnpm add @reaatech/agent-eval-harness-observability
```

## Feature Overview

- **OTel tracing** — automatic span generation for `eval.run` → `trajectory.load` → `judge.evaluate` → `gate.check` pipelines
- **7 pre-configured metrics** — `runs.total`, `trajectories.evaluated`, `judge.calls`, `judge.cost`, `gates.result`, `cost.per_task`, `latency.p99`
- **Pino structured logging** — JSON logs with automatic PII redaction (emails, phones, SSNs, API keys, tokens)
- **Tracing decorators** — `withTracing()` wrapper for adding custom spans with automatic context propagation
- **Dashboard manager** — in-memory 24-hour data retention with quality, cost, latency, and pass-rate panels and 4 alert types
- **Multiple exporters** — OTLP gRPC, Zipkin, and Console for local development

## Quick Start

```typescript
import {
  getLogger,
  getTracingManager,
  getMetricsManager,
  getDashboardManager,
} from "@reaatech/agent-eval-harness-observability";

// Structured logging with automatic PII redaction
const logger = getLogger();
logger.info({ runId: "eval-123", trajectories: 50 }, "Evaluation started");
logger.error({ err: new Error("Connection lost") }, "Judge API call failed");

// Metrics recording
const metrics = getMetricsManager();
metrics.recordRun("success", 1);
metrics.recordTrajectories("production", 50);
metrics.recordJudgeCall("claude-opus", "success");
metrics.recordJudgeCost("claude-opus", 0.0234);
metrics.recordGateResult("overall-quality", true);
metrics.recordLatencyP99("evaluation", 3200);

// Dashboard with trend analysis and alerting
const dashboard = getDashboardManager();
dashboard.recordRun({
  overallMetrics: { overallScore: 0.87, avgCostPerTask: 0.05, latencyP99: 3200 },
  summary: { totalTrajectories: 50, passRate: 92 },
  metricBreakdown: { faithfulness: { avgScore: 0.85 } },
});

console.log(`Quality trend: ${dashboard.getSummary().trends.score}`);
console.log(`Active alerts: ${dashboard.getAlerts().length}`);
```

## API Reference

### Logger

```typescript
import { getLogger, createChildLogger, setGlobalRunId, getGlobalRunId } from "@reaatech/agent-eval-harness-observability";
```

| Export | Description |
|--------|-------------|
| `getLogger(config?)` | Returns the singleton Logger instance, configured lazily |
| `createChildLogger(bindings)` | Creates a child logger with additional context fields |
| `setGlobalRunId(runId)` | Sets the run ID for log correlation |
| `getGlobalRunId()` | Returns the current global run ID, or `null` |

#### `LoggerConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `level` | `string` | `"info"` | Minimum log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `format` | `"json" \| "pretty"` | `"pretty"` (dev), `"json"` (prod) | Log output format |
| `includeRunId` | `boolean` | `true` | Include run ID on every log line |
| `piiPatterns` | `RegExp[]` | emails, phones, SSNs, API keys, tokens | PII redaction patterns |
| `redactFields` | `string[]` | `password`, `secret`, `token`, `apiKey`, `api_key`, `authorization` | Field-level redaction |

#### Logger Instance Methods

| Method | Description |
|--------|-------------|
| `trace(msg, ...args)` | Log at trace level |
| `debug(msg, ...args)` | Log at debug level |
| `info(msg, ...args)` | Log at info level |
| `warn(msg, ...args)` | Log at warn level |
| `error(msg, ...args)` | Log at error level |
| `fatal(msg, ...args)` | Log at fatal level |
| `child(bindings)` | Create child logger with additional context |
| `logEvalRunStart(runId, trajectoryCount, config)` | Log evaluation run start |
| `logEvalRunEnd(runId, metrics, duration)` | Log evaluation run completion |
| `logGateEvaluation(gateName, passed, reason)` | Log gate result |
| `logCost(runId, cost, breakdown)` | Log cost tracking |
| `logError(error, context?)` | Log error with optional context |

### Metrics

```typescript
import { getMetricsManager, recordMetric, incrementCounter } from "@reaatech/agent-eval-harness-observability";
```

#### `MetricsConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `serviceName` | `string` | `"agent-eval-harness"` | Service name for OTel resource |
| `enabled` | `boolean` | `true` | Enable metrics collection |
| `exporter` | `"otlp" \| "prometheus" \| "console" \| "none"` | `"console"` | Metrics exporter type |
| `otlpEndpoint` | `string` | — | OTLP collector endpoint |
| `prometheusPort` | `number` | — | Prometheus scrape port |
| `exportInterval` | `number` | `60000` | Export interval in milliseconds |

#### `MetricsManager` Instance Methods

| Method | Description |
|--------|-------------|
| `init()` | Initialize metrics and register instruments |
| `recordRun(status, count?)` | Record evaluation run as counter |
| `recordTrajectories(dataset, count?)` | Record trajectories evaluated |
| `recordJudgeCall(model, status)` | Record judge API call |
| `recordJudgeCost(model, cost)` | Record judge cost as histogram |
| `recordCostPerTask(taskType, cost)` | Record cost per task |
| `recordGateResult(gateName, passed)` | Record gate pass/fail (1/0) |
| `recordLatencyP99(component, latencyMs)` | Record P99 latency |
| `recordBatchMetrics(metrics)` | Record multiple metrics in one call |
| `forceFlush()` | Force flush pending metrics |
| `shutdown()` | Shutdown metrics provider |

#### Standalone Helpers

| Export | Description |
|--------|-------------|
| `recordMetric(name, value, attributes?)` | Record a metric by name to the current provider |
| `incrementCounter(name, value?, attributes?)` | Increment a counter by name |

#### 7 Pre-Configured OTel Instruments

| Name | Type | Unit | Description |
|------|------|------|-------------|
| `agent_eval.runs.total` | Counter | `runs` | Total evaluation runs |
| `agent_eval.trajectories.evaluated` | Counter | `trajectories` | Trajectories processed |
| `agent_eval.judge.calls` | Counter | `calls` | LLM judge API calls |
| `agent_eval.judge.cost` | Histogram | `USD` | Judge cost per run |
| `agent_eval.gates.result` | Histogram | `boolean` | Gate pass/fail (1/0) |
| `agent_eval.cost.per_task` | Histogram | `USD` | Cost per task |
| `agent_eval.latency.p99` | Histogram | `ms` | P99 latency per run |

### Tracing

```typescript
import { getTracingManager, withTracing, addSpanAttributes } from "@reaatech/agent-eval-harness-observability";
```

#### `TracingConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `serviceName` | `string` | `"agent-eval-harness"` | Service name for OTel resource |
| `version` | `string` | `"1.0.0"` | Service version |
| `enabled` | `boolean` | `true` | Enable tracing |
| `exporter` | `"otlp" \| "zipkin" \| "console" \| "none"` | `"console"` | Span exporter type |
| `otlpEndpoint` | `string` | — | OTLP collector endpoint |
| `zipkinEndpoint` | `string` | — | Zipkin collector endpoint |
| `sampleRate` | `number` | `1.0` | Sampling rate (0–1) |

#### `TracingManager` Instance Methods

| Method | Description |
|--------|-------------|
| `init()` | Initialize tracing provider and register exporters |
| `startEvalRunSpan(runId, config)` | Create span for evaluation run |
| `startTrajectoryLoadSpan(path, format)` | Create span for trajectory loading |
| `startJudgeSpan(model, metric)` | Create span for judge evaluation |
| `startGateSpan(gateCount)` | Create span for gate checking |
| `endSpan(span, result?, error?)` | End span with optional result or error |
| `getCurrentContext()` | Get current OTel context |
| `injectContext(headers)` | Inject context into carrier headers |
| `extractContext(headers)` | Extract context from carrier headers |
| `shutdown()` | Shutdown tracing provider |

#### Standalone Helpers

| Export | Description |
|--------|-------------|
| `withTracing(spanName, fn, attributes?)` | Wrap async function with tracing span |
| `addSpanAttributes(attributes)` | Add attributes to current active span |

### Dashboard

```typescript
import { getDashboardManager } from "@reaatech/agent-eval-harness-observability";
```

#### `DashboardConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `trendHours` | `number` | `24` | Time range for trend data in hours |
| `alertThresholds.qualityScore` | `number` | `0.8` | Alert when overall score drops below |
| `alertThresholds.costPerTask` | `number` | `0.05` | Alert when cost exceeds this value |
| `alertThresholds.latencyP99` | `number` | `5000` | Alert when P99 latency exceeds (ms) |
| `alertThresholds.passRate` | `number` | `0.95` | Alert when pass rate drops below |
| `trendWindow` | `number` | `3` | Number of data points for trend calculation |

#### `DashboardManager` Instance Methods

| Method | Description |
|--------|-------------|
| `recordRun(results)` | Record evaluation metrics from `AggregatedResults` |
| `getMetrics()` | Get all metric series data |
| `getAlerts()` | Get current alert messages |
| `getTrendData(metric, points?)` | Get trend data for a specific metric |
| `getSummary()` | Get dashboard summary with trends and alerts |
| `generateDashboard()` | Generate full dashboard panels |

#### 4 Alert Types

| Alert Metric | Condition | When |
|-------------|-----------|------|
| `quality_drop` | `overallScore < alertThresholds.qualityScore` | Quality falls below threshold |
| `cost_spike` | `avgCostPerTask > alertThresholds.costPerTask` | Cost exceeds threshold |
| `latency_spike` | `latencyP99 > alertThresholds.latencyP99` | P99 latency exceeds threshold |
| `pass_rate_drop` | `passRate / 100 < alertThresholds.passRate` | Pass rate falls below threshold |

#### 4 Dashboard Panels

| Panel | Type | Metrics Tracked |
|-------|------|----------------|
| **Quality** | `chart` | `overall_score`, `pass_rate` |
| **Performance** | `chart` | `latency_p99`, `cost_per_task` |
| **Key Statistics** | `stat` | Current score and pass rate with trend direction |
| **Alerts** | `alert` | Active alert messages with values and thresholds |

#### `DashboardSummary`

```typescript
interface DashboardSummary {
  totalRuns: number;
  currentScore: number | null;
  currentPassRate: number | null;
  currentCostPerTask: number | null;
  currentLatencyP99: number | null;
  activeAlerts: number;
  trends: {
    score: "up" | "down" | "stable";
    passRate: "up" | "down" | "stable";
  };
}
```

## Usage Patterns

### Custom Spans with `withTracing`

Wrap any async operation to automatically create, time, and finalize an OTel span:

```typescript
import { withTracing, addSpanAttributes } from "@reaatech/agent-eval-harness-observability";

const result = await withTracing(
  "custom_validation",
  async (span) => {
    // Span is active throughout this block
    addSpanAttributes({ validation_type: "schema", schema_version: "2.1" });

    const isValid = await validateInput(payload);
    return { isValid, timestamp: Date.now() };
  },
  { "custom.attribute": "value" },
);

// Span automatically ends — success status on return, error on throw
```

### Dashboards and Alerting

Record evaluation runs to populate the dashboard, then query trends and alerts:

```typescript
import { getDashboardManager } from "@reaatech/agent-eval-harness-observability";

const dashboard = getDashboardManager({
  alertThresholds: { qualityScore: 0.85, costPerTask: 0.03, latencyP99: 3000, passRate: 0.90 },
});

// Record a run
dashboard.recordRun({
  overallMetrics: { overallScore: 0.82, avgCostPerTask: 0.04, latencyP99: 4500 },
  summary: { totalTrajectories: 100, passRate: 88 },
  metricBreakdown: {},
});

// Check summary
const summary = dashboard.getSummary();
console.log(`Runs: ${summary.totalRuns}`);
console.log(`Score trend: ${summary.trends.score}`);
console.log(`Active alerts: ${summary.activeAlerts}`);

// Inspect alerts
for (const alert of dashboard.getAlerts()) {
  console.log(`[${alert.level}] ${alert.metric}: ${alert.message}`);
}

// Generate full dashboard panels (chart, stat, alert)
const panels = dashboard.generateDashboard();
for (const panel of panels) {
  console.log(`${panel.title} (${panel.type}): ${panel.metrics.length} metrics`);
}
```

### Structured Logging with Context

```typescript
import { getLogger, createChildLogger, setGlobalRunId } from "@reaatech/agent-eval-harness-observability";

const logger = getLogger();
setGlobalRunId("eval-run-42");

// All subsequent log lines include run_id: "eval-run-42"
logger.info({ taskType: "password-reset" }, "Starting evaluation");

// Create per-component child loggers
const judgeLogger = createChildLogger({ component: "judge" });
judgeLogger.info({ model: "claude-opus", metric: "faithfulness" }, "Judge evaluating");

// Errors carry stack traces
try {
  await doWork();
} catch (err) {
  logger.logError(err as Error, { taskId: "task-7" });
}
```

### Metrics Batching

```typescript
import { getMetricsManager } from "@reaatech/agent-eval-harness-observability";

const metrics = getMetricsManager();

metrics.recordBatchMetrics({
  runs: { status: "success" },
  trajectories: { dataset: "production" },
  judgeCalls: { model: "claude-opus", status: "success" },
  judgeCost: { model: "claude-opus", cost: 0.0234 },
  costPerTask: { taskType: "password-reset", cost: 0.0045 },
  gateResult: { gateName: "overall-quality", passed: true },
  latencyP99: { component: "evaluation", latencyMs: 3200 },
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
| [@reaatech/agent-eval-harness-gate](https://www.npmjs.com/package/@reaatech/agent-eval-harness-gate) | CI gates |
| [@reaatech/agent-eval-harness-mcp-server](https://www.npmjs.com/package/@reaatech/agent-eval-harness-mcp-server) | MCP server |
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | CLI |

## License

[MIT](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
