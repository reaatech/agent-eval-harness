---
agent_id: "agent-eval-harness"
display_name: "Agent Eval Harness"
version: "0.1.0"
description: "Evaluation harness for testing agent behavior and correctness"
type: "evaluator"
confidence_threshold: 0.9
---

# agent-eval-harness — Agent Development Guide

## What this is

This document defines how to use `agent-eval-harness` to evaluate AI agents through
comprehensive trajectory analysis, tool-use validation, cost tracking, quality
scoring, and CI regression gates. It covers the three-layer MCP tool architecture
(judge/suite/gate), golden trajectory management, LLM-as-judge with calibration,
observability setup, and CI integration patterns.

**Target audience:** Engineers building production AI agents who need to evaluate
agent behavior, optimize costs, ensure quality, and prevent regressions in CI/CD
pipelines.

**Package:** `@reaatech/agent-eval-harness` — MIT-licensed, Node.js >= 22.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│  agent-eval-     │────▶│   Evaluation   │
│  (Trajectory)   │     │   harness        │     │   Results      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Three-Layer     │
                       │  MCP Tools:      │
                       │  - eval.judge.*  │
                       │  - eval.suite.*  │
                       │  - eval.gate.*   │
                       └──────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Trajectory Evaluator** | `src/trajectory/` | Multi-turn conversation quality assessment |
| **Tool-Use Validator** | `src/tool-use/` | Verify tool call correctness |
| **Cost Tracker** | `src/cost/` | Per-task cost calculation with budget enforcement |
| **Latency Monitor** | `src/latency/` | SLA enforcement and optimization analysis |
| **LLM Judge** | `src/judge/` | Provider-agnostic calibrated quality scoring |
| **Golden Manager** | `src/golden/` | Reference trajectory management and curation |
| **Suite Runner** | `src/suite/` | Orchestrated evaluation runs with aggregation |
| **Gate Engine** | `src/gate/` | CI regression gates with JUnit/GitHub output |
| **MCP Server** | `src/mcp-server/` | Three-layer MCP tool exposure (stdio transport) |
| **Observability** | `src/observability/` | OTel tracing, metrics, structured logging, dashboards |
| **CLI** | `src/cli/` | Command-line interface (eval, judge, compare, gate, golden, report, serve) |

---

## Three-Layer MCP Tool Architecture

The harness exposes three distinct tool groups for different use cases. All tools
use the MCP protocol via stdio transport (`StdioServerTransport`).

### Layer 1: eval.judge.* (Atomic Operations)

Fast, stateless, composable operations for mid-task self-evaluation:

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| `eval.judge.faithfulness` | `{ context, response }` | `{ score, explanation, confidence }` | Check if response is faithful to context |
| `eval.judge.relevance` | `{ intent, response }` | `{ score, explanation, confidence }` | Check if response addresses intent |
| `eval.judge.tool_correctness` | `{ expected_tool, actual_tool, arguments?, result? }` | `{ score, explanation, confidence }` | Validate tool selection and arguments |
| `eval.judge.cost_check` | `{ trajectory, budget }` | `{ within_budget, cost, budget, usage_percentage }` | Verify cost within budget |
| `eval.judge.latency_check` | `{ trajectory, sla }` | `{ within_sla, p99_ms, p50_ms, p90_ms, total_ms }` | Verify latency within SLA |

**Example: Agent self-evaluation mid-task**

```json
{
  "name": "eval.judge.faithfulness",
  "arguments": {
    "context": "The user's account is associated with email john@example.com",
    "response": "I've sent the password reset to john@example.com"
  }
}
```

### Layer 2: eval.suite.* (Orchestrated Runs)

Stateful, longer-running operations for eval-driven development. Accepts inline
trajectory objects (not file paths). Storage is in-memory per session.

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| `eval.suite.run` | `{ trajectories, config? }` | `{ run_id, status, total_trajectories, completed, failed, duration_ms }` | Execute full evaluation suite |
| `eval.suite.status` | `{ run_id }` | `{ run_id, status, progress, completed, total, started_at, ended_at }` | Get evaluation run status |
| `eval.suite.results` | `{ run_id, format? }` | Aggregated results or summary | Retrieve evaluation results |
| `eval.suite.compare` | `{ baseline_run, candidate_run }` | `{ score_diff, verdict, regressions, improvements, key_findings }` | Compare two evaluation runs |
| `eval.suite.baseline` | `{ run_id, name? }` | `{ baseline_id, name, set_at }` | Set baseline for regression |

**Example: Developer running eval suite**

```json
{
  "name": "eval.suite.run",
  "arguments": {
    "trajectories": [
      {
        "trajectory_id": "traj-1",
        "turns": [
          {"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z"},
          {"turn_id": 1, "role": "agent", "content": "What's your email?", "timestamp": "2026-04-15T23:00:01Z"}
        ]
      }
    ],
    "config": {
      "metrics": ["faithfulness", "relevance", "tool_correctness", "cost", "latency"],
      "judge_model": "claude-opus",
      "budget_limit": 10.00
    }
  }
}
```

### Layer 3: eval.gate.* (CI Gates)

Opinionated, blocking operations for CI/CD. Uses in-memory gate storage per session.

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| `eval.gate.run` | `{ run_id?, gate_config?, results?, comparison? }` | `{ passed, total_gates, passed_gates, failed_gates, results, exit_code }` | Run CI-style pass/fail gate |
| `eval.gate.config` | `{ action, config?, preset? }` | `{ gates }` or `{ success, gates_loaded }` | Get/set/list gate configuration |
| `eval.gate.diff` | `{ baseline, candidate, metrics? }` | `{ score_diff, metric_diffs, regressions, improvements, verdict }` | Get detailed diff from baseline |

**Example: CI pipeline gate check**

```json
{
  "name": "eval.gate.run",
  "arguments": {
    "run_id": "eval-123",
    "results": {
      "overallMetrics": { "overallScore": 0.87 },
      "summary": { "totalTrajectories": 50, "passRate": 0.92 }
    }
  }
}
```

---

## Trajectory Format

### JSONL Format (One Turn Per Line)

```jsonl
{"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z"}
{"turn_id": 1, "role": "agent", "content": "I can help with that. What's your email?", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z", "latency_ms": 1200}
{"turn_id": 2, "role": "user", "content": "john@example.com", "timestamp": "2026-04-15T23:00:05Z"}
{"turn_id": 2, "role": "agent", "content": "Password reset sent!", "tool_calls": [{"name": "send_reset_email", "arguments": {"email": "john@example.com"}, "result": {"status": "sent"}}], "timestamp": "2026-04-15T23:00:06Z", "latency_ms": 800, "cost": {"input_tokens": 150, "output_tokens": 45}}
```

### Required Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `turn_id` | yes | number | Unique turn identifier within trajectory |
| `role` | yes | string | `"user"` or `"agent"` |
| `content` | yes | string | Message content |
| `timestamp` | yes | string | ISO-8601 timestamp |
| `tool_calls` | no | array | Tool invocations (agent turns only) |
| `latency_ms` | no | number | Turn latency in milliseconds |
| `cost` | no | object | Token usage and cost breakdown |

### Tool Call Structure

```json
{
  "name": "send_reset_email",
  "arguments": {
    "email": "john@example.com"
  },
  "result": {
    "status": "sent",
    "message_id": "msg-123"
  }
}
```

---

## Golden Trajectory Management

Golden trajectories serve as reference implementations for regression testing.

### Creating Golden Trajectories

1. **Record a perfect execution** of the agent handling a specific scenario
2. **Annotate with expected outcomes** and quality markers
3. **Store in JSONL format** in your golden trajectory directory

```jsonl
{"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z", "golden": true}
{"turn_id": 1, "role": "agent", "content": "I can help with that. What's your email?", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z", "expected": true, "quality_notes": "Polite, asks for necessary information"}
{"turn_id": 2, "role": "user", "content": "john@example.com", "timestamp": "2026-04-15T23:00:05Z"}
{"turn_id": 2, "role": "agent", "content": "Password reset sent!", "tool_calls": [{"name": "send_reset_email", "arguments": {"email": "john@example.com"}, "result": {"status": "sent"}}], "timestamp": "2026-04-15T23:00:06Z", "expected": true, "quality_notes": "Correct tool, proper arguments, confirms action"}
```

### Comparing Against Golden

```typescript
import { compareAgainstGolden } from '@reaatech/agent-eval-harness';

const result = compareAgainstGolden(trajectory, goldenTrajectory, {
  similarityThreshold: 0.85,
});

console.log(`Similarity: ${result.similarity}`);
console.log(`Regressions: ${result.regressions.length}`);
```

### Golden Curation

The `GoldenCurator` class provides a structured curation workflow:

```typescript
import { createCurator, quickCreateGolden } from '@reaatech/agent-eval-harness';

// Full curation workflow (identify → annotate → validate → publish)
const curator = createCurator('my_suite');
curator.start(trajectory);
curator.annotateTurn(0, 'Polite greeting', true);
curator.runQualityChecks();
const golden = curator.publish();

// Quick creation for simple scenarios
const golden = quickCreateGolden(trajectory, { scenario: 'password-reset' });
```

---

## LLM-as-Judge with Calibration

### Provider-Agnostic Configuration

The judge engine supports four providers: `claude` (Anthropic SDK), `gpt4` (OpenAI SDK), `gemini` (Google Generative AI), and `openrouter` (OpenAI-compatible). Provider selection is via the `JudgeConfig`:

```yaml
# judge-config.yaml
judge:
  model: claude-opus
  provider: claude

  # Fallback models for resilience
  fallback_models:
    - gpt-4-turbo
    - gemini-pro

  # Calibration settings
  calibration:
    enabled: true
    calibration_method: 'temperature_scaling'

  # Consensus settings
  consensus:
    enabled: true
    models: [claude-opus, gpt-4-turbo]
    voting_strategy: weighted
    tie_breaker: highest_confidence

  # Cost controls
  cost:
    budget_limit: 50.00
    max_cost_per_judgment: 0.10
    alert_thresholds: [0.5, 0.75, 0.9]
```

### Calibration Methods

Three calibration methods are available:

| Method | Description |
|--------|-------------|
| `temperature_scaling` | Adjusts logit temperature via grid search to minimize MAE |
| `isotonic_regression` | Non-parametric calibration preserving ranking |
| `linear` | Simple linear regression fit |

### Calibration Process

1. **Add calibration data** from human-labeled samples
2. **Run calibrate** to fit the model against human labels
3. **Apply calibration** to future judge scores

```typescript
import { JudgeCalibrator } from '@reaatech/agent-eval-harness';

const calibrator = new JudgeCalibrator({ method: 'temperature_scaling' });
calibrator.addCalibrationData({ raw: 0.65, expected: 0.80 });
calibrator.addCalibrationData({ raw: 0.90, expected: 0.95 });
await calibrator.calibrate();

const calibrated = calibrator.apply(0.72);
console.log(`Calibrated score: ${calibrated.score}`);
```

### Consensus Voting

```typescript
import { ConsensusEngine } from '@reaatech/agent-eval-harness';

const consensus = new ConsensusEngine({ votingStrategy: 'weighted' });
consensus.addVote({ model: 'claude-opus', score: 0.85, confidence: 0.9, weight: 0.5 });
consensus.addVote({ model: 'gpt-4-turbo', score: 0.78, confidence: 0.85, weight: 0.3 });
const result = consensus.compute();
console.log(`Consensus score: ${result.score}`);
```

---

## Cost Tracking

### Per-Task Cost Calculation

```yaml
# cost-config.yaml
cost:
  # Provider pricing (per million tokens) — 8 models supported
  pricing:
    claude-opus:
      input: 15.00
      output: 75.00
    claude-sonnet:
      input: 3.00
      output: 15.00
    claude-haiku:
      input: 0.25
      output: 1.25
    gpt-4-turbo:
      input: 10.00
      output: 30.00
    gpt-4:
      input: 30.00
      output: 60.00
    gpt-4-mini:
      input: 0.15
      output: 0.60
    gemini-pro:
      input: 2.50
      output: 7.50
    gemini-flash:
      input: 0.50
      output: 1.50

  # Budget settings
  budgets:
    per_task: 0.05
    per_trajectory: 1.00
    daily: 100.00

  # Alert thresholds
  alerts:
    - threshold: 0.5
      action: log
    - threshold: 0.75
      action: notify
    - threshold: 0.9
      action: block
```

### Budget Presets

Three named presets are available for quick setup:

| Preset | Per Task | Per Trajectory | Daily |
|--------|----------|----------------|-------|
| `strict` | $0.02 | $0.50 | $50.00 |
| `moderate` | $0.05 | $1.00 | $100.00 |
| `lenient` | $0.10 | $2.00 | $250.00 |

### Cost Breakdown

The harness tracks costs at multiple levels:

```json
{
  "trajectory_id": "traj-123",
  "total_cost": 0.0234,
  "breakdown": {
    "llm_calls": 0.0180,
    "tool_invocations": 0.0054,
    "judge_evaluations": 0.0000
  },
  "per_turn": [
    { "turn_id": 1, "cost": 0.0045, "tokens": { "input": 150, "output": 45 } },
    { "turn_id": 2, "cost": 0.0032, "tokens": { "input": 120, "output": 32 } }
  ]
}
```

### Cost Reporting

Export cost data in multiple formats:

```typescript
import { generateCostReport, exportToCsv, exportToJson, formatCost } from '@reaatech/agent-eval-harness';

const report = generateCostReport(trajectories);
console.log(formatCost(report.totalCost));

const csv = exportToCsv(report);
const json = exportToJson(report);
```

---

## Latency Budgets

### SLA Configuration

```yaml
# latency-config.yaml
latency:
  # Budget thresholds
  budgets:
    per_turn_p50: 1000    # 1 second
    per_turn_p90: 2000    # 2 seconds
    per_turn_p99: 5000    # 5 seconds
    trajectory_total: 30000  # 30 seconds

  # Component breakdown
  components:
    llm_call: 800
    tool_invocation: 200
    total_overhead: 100
```

### Latency Presets

| Preset | P50 | P90 | P99 | Trajectory Total |
|--------|-----|-----|-----|------------------|
| `strict` | 500ms | 1000ms | 2000ms | 15s |
| `moderate` | 1000ms | 2000ms | 5000ms | 30s |
| `lenient` | 2000ms | 4000ms | 10000ms | 60s |

### Latency Monitoring

```typescript
import { monitorLatency, enforceBudget, analyzeOptimization } from '@reaatech/agent-eval-harness';

// Basic monitoring
const result = monitorLatency(trajectory);
console.log(`P99 latency: ${result.p99Ms}ms`);

// SLA enforcement
const budget = { per_turn_p99: 5000, trajectory_total: 30000 };
const enforcement = enforceBudget(trajectory, budget);
console.log(`SLA violations: ${enforcement.violations.length}`);

// Optimization analysis
const optimization = analyzeOptimization(trajectory);
console.log(`Bottlenecks: ${optimization.bottlenecks.length}`);
```

---

## Tool-Use Validation

### Validation Architecture

Three-layer validation: correct tool selection (13 issue types), schema compliance (JSON Schema), and result verification (8 issue types including hallucination detection).

```yaml
# tool-validation-config.yaml
tool_validation:
  # Schema validation
  schema_validation:
    enabled: true
    strict_mode: true

  # Tool selection validation
  tool_selection:
    enabled: true
    allow_unknown_tools: false

  # Result verification
  result_verification:
    enabled: true
    check_hallucination: true
    verify_integration: true
```

### Validation Example

```typescript
import { validateTrajectory, validateSchema, verifyResult, createToolSchema } from '@reaatech/agent-eval-harness';

const toolSchemas = {
  send_reset_email: createToolSchema({
    parameters: {
      email: { type: 'string', format: 'email' },
    },
    required: ['email'],
  }),
};

// Full trajectory validation
const result = validateTrajectory(trajectory, toolSchemas);
console.log(`Valid: ${result.valid}, Issues: ${result.issues.length}`);

// Schema-only validation
const schemaResult = validateSchema(toolCall, toolSchemas.send_reset_email);
console.log(`Schema valid: ${schemaResult.valid}`);

// Result verification (hallucination detection)
const verifyResultOut = verifyResult(toolCall, toolSchemas);
console.log(`Hallucination detected: ${verifyResultOut.hasHallucination}`);
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/eval.yml
name: Agent Evaluation

on:
  pull_request:
    branches: [main]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run evaluation suite
        run: |
          npx agent-eval-harness eval trajectories/*.jsonl \
            --config eval-config.yaml \
            --output results/

      - name: Run regression gates
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

      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const results = require('./results/results.json');
            const comment = `## Evaluation Results

            **Overall Score:** ${results.overallMetrics?.overallScore}
            **Pass Rate:** ${results.summary?.passRate}
            **Trajectories:** ${results.summary?.totalTrajectories}`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### CI Integration API

```typescript
import {
  CIIntegration,
  writeJUnitReport,
  outputGitHubAnnotations,
  setGitHubOutput,
  exportForCI,
} from '@reaatech/agent-eval-harness';

const engine = createGateEngine(gates);
const summary = engine.evaluate(results);

// Generate JUnit XML for test reporters
writeJUnitReport(summary, './reports/gates.xml');

// Generate GitHub Actions annotations
const annotations = CIIntegration.generateGitHubAnnotations(summary);
annotations.forEach((a) => console.log(a));

// Set GitHub Actions step outputs
setGitHubOutput(summary);

// Get CI exit code (0 = pass, 1 = gate failure)
const exitCode = CIIntegration.getExitCode(summary);
process.exit(exitCode);

// Full CI export (annotations + JUnit + outputs)
exportForCI(summary, './reports/', process.env);
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

### Gate Presets

Three presets provide ready-made gate configurations:

| Preset | Overall Quality | Cost | Latency P99 | Tool Correctness | Faithfulness |
|--------|----------------|------|-------------|------------------|--------------|
| **standard** | >= 0.80 | <= $0.05 | <= 5000ms | >= 0.95 | >= 0.85 |
| **strict** | >= 0.90 | <= $0.03 | <= 3000ms | >= 0.98 | >= 0.90 |
| **lenient** | >= 0.70 | <= $0.10 | <= 10000ms | >= 0.85 | >= 0.75 |

### Programmatic Gate Construction

```typescript
import {
  createOverallQualityGate,
  createCostGate,
  createLatencyGate,
  createNoRegressionGate,
  createGateEngine,
  getStandardPreset,
  getStrictPreset,
  getLenientPreset,
} from '@reaatech/agent-eval-harness';

// Use a preset
const standard = getStandardPreset();
const engine = createGateEngine(standard.gates);

// Or build custom gates
const customGates = [
  createOverallQualityGate(0.80),
  createCostGate(0.05),
  createLatencyGate(5000),
  createNoRegressionGate(baselineResults, 'overall_score'),
];
const customEngine = createGateEngine(customGates);
```

---

## CLI Reference

```bash
# Run full evaluation
npx agent-eval-harness eval trajectories/*.jsonl \
  --golden golden/reference.jsonl \
  --judge-model claude-opus \
  --budget 10.00 \
  --format json \
  --output results/

# Run specific judge evaluation
npx agent-eval-harness judge faithfulness \
  --context "The user's account is associated with email john@example.com" \
  --response "I've sent the password reset to john@example.com" \
  --model claude-opus \
  --calibrated

# Compare two runs (exits 1 on regressions)
npx agent-eval-harness compare results/baseline.json results/candidate.json \
  --statistical \
  --format markdown

# Check regression gates (exits 1 on failures)
npx agent-eval-harness gate results/results.json \
  --preset standard \
  --exit-code

# Manage golden trajectories
npx agent-eval-harness golden --list
npx agent-eval-harness golden --create trajectories/perfect-run.jsonl
npx agent-eval-harness golden --validate golden/my-golden.jsonl

# Generate report (JSON, HTML, or Markdown)
npx agent-eval-harness report results/results.json \
  --format html \
  --output report.html

# Start MCP server (stdio transport)
npx agent-eval-harness serve
```

---

## Observability

### OpenTelemetry Tracing

Every evaluation run generates spans:

```
eval.run
├── trajectory.load
├── judge.evaluate  (per batch)
└── gate.check
```

Exporters supported: OTLP (gRPC), Zipkin, Console.

```typescript
import { getTracingManager, withTracing } from '@reaatech/agent-eval-harness';

const tracer = getTracingManager();
await withTracing('my_custom_span', async (span) => {
  // Your traced operation
});
```

### Metrics (7 OTel Instruments)

| Metric | Type | Description |
|--------|------|-------------|
| `agent_eval.runs.total` | Counter | Total evaluation runs |
| `agent_eval.trajectories.evaluated` | Counter | Trajectories processed |
| `agent_eval.judge.calls` | Counter | LLM judge API calls |
| `agent_eval.judge.cost` | Histogram | Judge cost per run |
| `agent_eval.gates.result` | Histogram | Gate pass/fail (1/0) |
| `agent_eval.cost.per_task` | Histogram | Cost per task |
| `agent_eval.latency.p99` | Histogram | P99 latency per run |

```typescript
import { getMetricsManager, incrementCounter } from '@reaatech/agent-eval-harness';

const metrics = getMetricsManager();
incrementCounter('agent_eval.runs.total', 1);
```

### Structured Logging (Pino)

All logs are structured JSON with PII redaction (emails, phones, SSNs, API keys, tokens automatically redacted):

```typescript
import { getLogger, setGlobalRunId } from '@reaatech/agent-eval-harness';

const logger = getLogger();
setGlobalRunId('eval-123');
logger.info('Evaluation completed', { trajectories: 50, overall_score: 0.87 });
```

### Dashboard

In-memory dashboard tracks quality/cost/latency/pass-rate trends with 4 alert types and 24-hour data retention:

```typescript
import { getDashboardManager } from '@reaatech/agent-eval-harness';

const dashboard = getDashboardManager();
dashboard.recordRun({ runId: 'eval-123', overallScore: 0.87, cost: 12.34, p99Ms: 3200 });
const panel = dashboard.getPanel('quality');
console.log(`Quality trend: ${panel.trend}`);
```

---

## Docker

```bash
# Build
docker build -t agent-eval-harness .

# Run evaluation with mounted volumes
docker run -v ./trajectories:/app/trajectories \
  -v ./results:/app/results \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  agent-eval-harness eval trajectories/*.jsonl

# Start MCP server (stdio transport — no port mapping needed)
docker run -i agent-eval-harness serve

# Full observability stack via docker-compose
docker-compose up -d
# Jaeger: http://localhost:16686
# Grafana: http://localhost:3001
# Prometheus: http://localhost:9090
```

---

## Security Considerations

### PII Handling

- **Never log raw trajectory content** — field-level PII redaction via regex (emails, phones, SSNs, API keys, tokens)
- **Redact sensitive data** before exporting results
- **Encrypt trajectory storage** at rest and in transit

### API Key Management

- All LLM API keys from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`)
- Never log API keys or tokens — redacted at the logger level
- Separate keys per provider for isolation

### Cost Controls

- Set budget limits to prevent runaway costs
- Use `--budget` flag or budget configuration for enforcement
- 3-tier alert thresholds (50% log, 75% notify, 90% block)
- Daily budget tracking with cumulative awareness

---

## Skills Directory

Ten specialized skill documents in `skills/` provide in-depth guidance for each evaluation domain:

| Skill | File | Focus |
|-------|------|-------|
| Trajectory Evaluation | `skills/trajectory-eval/skill.md` | Multi-turn quality, coherence, goal completion |
| Tool-Use Validation | `skills/tool-use-validation/skill.md` | Tool selection, schema compliance, argument validation |
| Cost Tracking | `skills/cost-tracking/skill.md` | Per-task costs, budget alerts, optimization |
| Latency Budgets | `skills/latency-budgets/skill.md` | P50/P90/P99 monitoring, SLA enforcement |
| LLM Judge | `skills/llm-judge-calibrated/skill.md` | Provider-agnostic judge, calibration, consensus |
| Golden Trajectories | `skills/golden-trajectories/skill.md` | Reference trajectory creation, annotation, comparison |
| Regression Suites | `skills/regression-suites/skill.md` | Suite orchestration, run comparison, significance |
| Faithfulness Scoring | `skills/faithfulness-scoring/skill.md` | Hallucination detection, context adherence |
| Relevance Scoring | `skills/relevance-scoring/skill.md` | Intent alignment, response utility |
| Eval Gating | `skills/eval-gating/skill.md` | CI/CD quality gates, threshold/baseline/statistical gates |

---

## Testing

### Running Tests

```bash
npm test                     # All tests (vitest)
npm run test:unit            # Unit tests only
npm run test:integration     # Integration tests only
npm run test:coverage        # With coverage (80% threshold enforced)
npm run test:watch           # Watch mode
```

### Test Structure

```
tests/
├── unit/                    # 8 unit test files (~9,100 lines)
│   ├── trajectory.test.ts   # Loader, evaluator, comparator
│   ├── tool-use.test.ts     # Validator, schema checker, result verifier
│   ├── cost.test.ts         # Cost tracking, budgets, reporter
│   ├── latency.test.ts      # Monitor, enforcement, optimizer
│   ├── judge.test.ts        # Engine, calibration, cost tracker, prompts
│   ├── gate.test.ts         # Engine, threshold, baseline, CI integration
│   ├── golden.test.ts       # Manager, comparator, curator
│   └── suite.test.ts        # Config, runner, results, comparator
├── integration/             # 1 integration test (~1,100 lines)
│   └── eval-pipeline.test.ts # Full end-to-end pipeline
└── fixtures/                # Test fixture data (supports .jsonl, .yaml)
```

---

## Deployment

Six cloud platforms are supported via Terraform modules in `infra/`:

| Platform | Compute | State |
|----------|---------|-------|
| **GCP** | Cloud Run (0-5 instances, 512Mi-1GB, 300s timeout) | `infra/environments/dev/`, `infra/environments/prod/` |
| **AWS** | ECS Fargate + RDS + ElastiCache + S3 | `infra/modules/aws-*` |
| **Azure** | Container Apps + PostgreSQL + Redis + Blob Storage | `infra/modules/azure-container-apps/` |
| **OCI** | OKE (Kubernetes) + Object Storage | `infra/modules/oci-oke/` |
| **Netlify** | Serverless Functions | `infra/modules/netlify/` |
| **Vercel** | Serverless Functions | `infra/modules/vercel/` |

---

## Checklist: Production Readiness

Before deploying an evaluation pipeline to production:

- [ ] Trajectory format validated (required fields present)
- [ ] Golden trajectories established for critical scenarios
- [ ] LLM judge calibrated against human labels
- [ ] Cost budgets configured with appropriate limits
- [ ] Latency SLAs defined and monitored
- [ ] Regression gates configured with appropriate thresholds
- [ ] PII redaction verified in logs
- [ ] CI integration tested (exit codes, reports)
- [ ] Cost tracking enabled and alerts configured
- [ ] Reproducibility verified (same inputs should produce same outputs)
- [ ] Provider fallbacks configured for resilience
- [ ] API rate limits configured per provider
- [ ] OTel exporters configured (OTLP, Zipkin, or Console)
- [ ] Docker image built and pushed to registry

---

## References

- **ARCHITECTURE.md** — System design deep dive
- **DEV_PLAN.md** — Development checklist (18 phases, all complete)
- **README.md** — Quick start and overview
- **CLAUDE.md** — Developer reference (adding metrics, judge prompts, MCP tools)
- **WALKTHROUGH.md** — Step-by-step walkthrough
- **CHANGELOG.md** — Version history
- **trajectories/examples/** — Example trajectories (`sample.jsonl`, `golden.jsonl`) and `config.yaml`
- **skills/** — 10 domain-specific skill documents
- **MCP Specification** — https://modelcontextprotocol.io/
- **GitHub Repository** — https://github.com/reaatech/agent-eval-harness
