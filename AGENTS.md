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
comprehensive trajectory analysis, tool-use validation, cost tracking, and quality
scoring. It covers the three-layer MCP tool architecture (judge/suite/gate), golden
trajectory management, LLM-as-judge with calibration, and CI integration patterns.

**Target audience:** Engineers building production AI agents who need to evaluate
agent behavior, optimize costs, ensure quality, and prevent regressions in CI/CD
pipelines.

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
| **Cost Tracker** | `src/cost/` | Per-task cost calculation |
| **Latency Monitor** | `src/latency/` | SLA enforcement |
| **LLM Judge** | `src/judge/` | Calibrated quality scoring |
| **Golden Manager** | `src/golden/` | Reference trajectory management |
| **Suite Runner** | `src/suite/` | Orchestrated evaluation runs |
| **Gate Engine** | `src/gate/` | CI regression gates |
| **MCP Server** | `src/mcp-server/` | Three-layer tool exposure |

---

## Three-Layer MCP Tool Architecture

The harness exposes three distinct tool groups for different use cases:

### Layer 1: eval.judge.* (Atomic Operations)

Fast, stateless, composable operations for mid-task self-evaluation:

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| `eval.judge.faithfulness` | `{ context, response }` | `{ score, explanation }` | Check if response is faithful to context |
| `eval.judge.relevance` | `{ intent, response }` | `{ score, explanation }` | Check if response addresses intent |
| `eval.judge.tool_correctness` | `{ expected_tool, actual_tool, arguments }` | `{ correct, issues }` | Validate tool selection and arguments |
| `eval.judge.cost_check` | `{ trajectory, budget }` | `{ within_budget, cost }` | Verify cost within budget |
| `eval.judge.latency_check` | `{ trajectory, sla }` | `{ within_sla, p99_ms }` | Verify latency within SLA |

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

Stateful, longer-running operations for eval-driven development:

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| `eval.suite.run` | `{ trajectories, config }` | `{ run_id, status }` | Execute full evaluation suite |
| `eval.suite.status` | `{ run_id }` | `{ status, progress }` | Get evaluation run status |
| `eval.suite.results` | `{ run_id }` | `{ results, metrics }` | Retrieve evaluation results |
| `eval.suite.compare` | `{ baseline_run, candidate_run }` | `{ diff, stats }` | Compare two evaluation runs |
| `eval.suite.baseline` | `{ run_id, name }` | `{ baseline_id }` | Set baseline for regression |

**Example: Developer running eval suite**

```json
{
  "name": "eval.suite.run",
  "arguments": {
    "trajectories": ["trajectories/test-run-1.jsonl"],
    "config": {
      "metrics": ["faithfulness", "relevance", "tool_correctness", "cost", "latency"],
      "judge_model": "claude-opus",
      "budget_limit": 10.00
    }
  }
}
```

### Layer 3: eval.gate.* (CI Gates)

Opinionated, blocking operations for CI/CD:

| Tool | Input | Output | Use Case |
|------|-------|--------|----------|
| `eval.gate.run` | `{ run_id, gate_config }` | `{ passed, failures }` | Run CI-style pass/fail gate |
| `eval.gate.config` | `{ action, config }` | `{ config }` | Get/set gate configuration |
| `eval.gate.diff` | `{ baseline, candidate }` | `{ diff, regressions }` | Get detailed diff from baseline |

**Example: CI pipeline gate check**

```json
{
  "name": "eval.gate.run",
  "arguments": {
    "run_id": "eval-123",
    "gate_config": "gates.yaml"
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

---

## LLM-as-Judge with Calibration

### Provider-Agnostic Configuration

```yaml
# judge-config.yaml
judge:
  # Primary judge model (any provider)
  model: claude-opus
  
  # Fallback models for resilience
  fallback_models:
    - gpt-4-turbo
    - gemini-pro
  
  # Calibration settings
  calibration:
    enabled: true
    human_labels: 'calibration/human-labels.jsonl'
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

### Calibration Process

1. **Collect human labels** for a representative sample
2. **Run judge on same samples** to get raw scores
3. **Fit calibration model** (temperature scaling or isotonic regression)
4. **Apply calibration** to future judge scores

```typescript
import { calibrate, applyCalibration } from '@reaatech/agent-eval-harness';

await calibrate({
  humanLabelsPath: 'calibration/human-labels.jsonl',
  method: 'temperature_scaling',
});

// Apply calibration to new scores
const calibratedScore = applyCalibration(rawScore);
```

### Consensus Voting

For higher accuracy, use multiple judges:

```yaml
consensus:
  enabled: true
  models:
    - id: claude-opus
      weight: 0.5
    - id: gpt-4-turbo
      weight: 0.3
    - id: gemini-pro
      weight: 0.2
  voting_strategy: weighted
  min_agreement: 0.7
```

---

## Cost Tracking

### Per-Task Cost Calculation

```yaml
# cost-config.yaml
cost:
  # Provider pricing (per million tokens)
  pricing:
    claude-opus:
      input: 15.00
      output: 75.00
    gpt-4-turbo:
      input: 10.00
      output: 30.00
    gemini-pro:
      input: 2.50
      output: 7.50
  
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

### Latency Monitoring

```typescript
import { monitorLatency } from '@reaatech/agent-eval-harness';

const budget = {
  per_turn_p99: 5000,
  trajectory_total: 30000,
};

const result = monitorLatency(trajectory, budget);

console.log(`P99 latency: ${result.p99_ms}ms`);
console.log(`SLA violations: ${result.violations.length}`);
```

---

## Tool-Use Validation

### Validation Rules

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
import { validateTrajectory, validateSchema } from '@reaatech/agent-eval-harness';

const toolSchemas = {
  send_reset_email: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
    },
    required: ['email'],
  },
};

const result = validateTrajectory(trajectory, toolSchemas);

console.log(`Valid: ${result.valid}`);
console.log(`Issues: ${result.issues}`);
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
          npx agent-eval-harness eval \
            --trajectories trajectories/pr-run.jsonl \
            --config eval-config.yaml \
            --output results.json
      
      - name: Run regression gates
        run: |
          npx agent-eval-harness gate \
            --results results.json \
            --gates gates.yaml \
            --baseline results/baseline.json
      
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
            const results = require('./results.json');
            const comment = `## Evaluation Results
            
            **Overall Score:** ${results.overall_score}
            **Gates:** ${results.gates_passed ? '✅ Passed' : '❌ Failed'}
            
            ${results.regressions.length > 0 ? '**Regressions:**\n' + results.regressions.map(r => `- ${r.metric}: ${r.baseline} → ${r.current}`).join('\n') : ''}`;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
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

---

## Security Considerations

### PII Handling

- **Never log raw trajectory content** — use hashed identifiers
- **Redact sensitive data** before exporting results
- **Encrypt trajectory storage** at rest and in transit

### API Key Management

- All LLM API keys from environment variables
- Never log API keys or tokens
- Separate keys per provider for isolation

### Cost Controls

- Set budget limits to prevent runaway costs
- Use cost estimation before running expensive operations
- Monitor costs in real-time with alerts

---

## Observability

### Structured Logging

Every evaluation run is logged with:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "agent-eval-harness",
  "eval_run_id": "eval-123",
  "trajectories": 50,
  "overall_score": 0.87,
  "judge_cost": 12.34,
  "gates_passed": true,
  "duration_ms": 45000
}
```

### OpenTelemetry Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `agent_eval.runs.total` | Counter | Total evaluation runs |
| `agent_eval.trajectories.evaluated` | Counter | Trajectories processed |
| `agent_eval.judge.calls` | Counter | LLM judge API calls |
| `agent_eval.judge.cost` | Histogram | Judge cost per run |
| `agent_eval.gates.result` | Gauge | Gate pass/fail (1/0) |
| `agent_eval.cost.per_task` | Histogram | Cost per task |
| `agent_eval.latency.p99` | Gauge | P99 latency |

### Tracing

Each evaluation run generates OpenTelemetry spans:
- `eval.run` — root span for evaluation
- `trajectory.load` — trajectory loading
- `judge.evaluate` — LLM judge calls
- `gate.check` — regression gate evaluation

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
- [ ] Reproducibility verified (same inputs → same outputs)
- [ ] Provider fallbacks configured for resilience
- [ ] Rate limits configured per provider

---

## References

- **ARCHITECTURE.md** — System design deep dive
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **trajectories/examples/** — Example trajectories and configurations
- **MCP Specification** — https://modelcontextprotocol.io/
- **agent-mesh/AGENTS.md** — Multi-agent orchestration patterns
- **classifier-evals/AGENTS.md** — Classifier evaluation patterns
