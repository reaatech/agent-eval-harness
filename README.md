# agent-eval-harness

End-to-end agent evaluation harness for full agent runs. Supports trajectory evaluation, tool-use correctness validation, cost-per-task tracking, latency budget enforcement, regression suites with golden trajectories, and LLM-as-judge with calibration.

## What This Is

`agent-eval-harness` evaluates complete agent executions — multi-turn conversations, tool invocations, and task completion quality. It's distinct from classifier evaluation tools; this focuses on the full agent trajectory.

**Key capabilities:**

- **Trajectory Evaluation** — Multi-turn conversation quality assessment
- **Tool-Use Validation** — Verify correct tool selection and argument schema compliance
- **Cost Tracking** — Per-task cost calculation with budget enforcement
- **Latency Monitoring** — SLA threshold checking (p50, p90, p99)
- **LLM-as-Judge** — Calibrated quality scoring with any provider (Claude, GPT-4, Gemini)
- **Golden Trajectories** — Reference implementations for regression testing
- **CI Integration** — Pass/fail gates with GitHub Actions output

## Quick Start

### Installation

```bash
# npm
npm install agent-eval-harness

# Or use without installing
npx agent-eval-harness eval trajectories/*.jsonl
```

### Run Your First Evaluation

1. **Create a trajectory file** (JSONL format):

```jsonl
{"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z"}
{"turn_id": 1, "role": "agent", "content": "I can help with that. What's your email?", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z"}
{"turn_id": 2, "role": "user", "content": "john@example.com", "timestamp": "2026-04-15T23:00:05Z"}
{"turn_id": 2, "role": "agent", "content": "Password reset sent!", "tool_calls": [{"name": "send_reset_email", "arguments": {"email": "john@example.com"}, "result": {"status": "sent"}}], "timestamp": "2026-04-15T23:00:06Z", "latency_ms": 800, "cost": {"input_tokens": 150, "output_tokens": 45}}
```

2. **Run evaluation:**

```bash
npx agent-eval-harness eval trajectories/my-run.jsonl --output results/
```

3. **View results:**

```bash
cat results/results.json
```

## Three-Layer Architecture

The harness exposes three distinct tool groups via MCP:

### Layer 1: eval.judge.* (Atomic Operations)

Fast, stateless operations for mid-task self-evaluation:

| Tool | Description |
|------|-------------|
| `eval.judge.faithfulness` | Score response faithfulness to context |
| `eval.judge.relevance` | Score response relevance to intent |
| `eval.judge.tool_correctness` | Validate tool call correctness |
| `eval.judge.cost_check` | Verify cost within budget |
| `eval.judge.latency_check` | Verify latency within SLA |

### Layer 2: eval.suite.* (Orchestrated Runs)

Stateful operations for eval-driven development:

| Tool | Description |
|------|-------------|
| `eval.suite.run` | Execute full evaluation suite |
| `eval.suite.status` | Get evaluation run status |
| `eval.suite.results` | Retrieve evaluation results |
| `eval.suite.compare` | Compare two evaluation runs |
| `eval.suite.baseline` | Set/update baseline for regression |

### Layer 3: eval.gate.* (CI Gates)

Opinionated, blocking operations for CI/CD:

| Tool | Description |
|------|-------------|
| `eval.gate.run` | Run CI-style pass/fail gate |
| `eval.gate.config` | Get/set gate configuration |
| `eval.gate.diff` | Get detailed diff from baseline |

## CLI Reference

```bash
# Run full evaluation
npx agent-eval-harness eval trajectories/*.jsonl \
  --golden golden/reference.jsonl \
  --judge-model claude-opus \
  --budget 10.00 \
  --format json \
  --output results/

# Run specific judge
npx agent-eval-harness judge faithfulness \
  --context "The user's account is associated with email john@example.com" \
  --response "I've sent the password reset to john@example.com" \
  --model claude-opus

# Compare two runs
npx agent-eval-harness compare baseline/results.json candidate/results.json \
  --statistical \
  --format markdown

# Check regression gates
npx agent-eval-harness gate results/results.json \
  --preset standard \
  --exit-code

# Manage golden trajectories
npx agent-eval-harness golden --list
npx agent-eval-harness golden --create trajectories/perfect-run.jsonl
npx agent-eval-harness golden --validate golden/my-golden.jsonl

# Generate report
npx agent-eval-harness report results/results.json \
  --format html \
  --output report.html

# Start MCP server (uses stdio transport)
npx agent-eval-harness serve
```

## Trajectory Format

### JSONL Format (One Turn Per Line)

```jsonl
{"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z"}
{"turn_id": 1, "role": "agent", "content": "I can help with that. What's your email?", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z"}
```

### Required Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `turn_id` | yes | number | Unique turn identifier |
| `role` | yes | string | `"user"` or `"agent"` |
| `content` | yes | string | Message content |
| `timestamp` | yes | string | ISO-8601 timestamp |
| `tool_calls` | no | array | Tool invocations (agent turns) |
| `latency_ms` | no | number | Turn latency in milliseconds |
| `cost` | no | object | Token usage and cost |

### Tool Call Structure

```json
{
  "name": "send_reset_email",
  "arguments": { "email": "john@example.com" },
  "result": { "status": "sent" }
}
```

## CI/CD Integration

### GitHub Actions

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
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx agent-eval-harness eval \
            trajectories/*.jsonl \
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
```

## Docker

```bash
# Build
docker build -t agent-eval-harness .

# Run evaluation
docker run -v ./trajectories:/app/trajectories \
  -v ./results:/app/results \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  agent-eval-harness eval trajectories/*.jsonl

# Start MCP server (stdio transport — no port mapping needed)
docker run -i agent-eval-harness serve
```

Or use docker-compose for full observability stack:

```bash
docker-compose up -d
# Jaeger UI: http://localhost:16686
# Grafana: http://localhost:3001
# Prometheus: http://localhost:9090
```

## FAQ

**Q: Can I use this with any LLM provider?**
A: Yes, the judge is provider-agnostic. Configure via `--judge-model` or environment variables.

**Q: How do I calibrate the LLM judge?**
A: Use the `--calibrated` flag with human-labeled data. See AGENTS.md for details.

**Q: Can I evaluate in real-time?**
A: This tool is designed for batch evaluation of recorded trajectories. For real-time evaluation, use the MCP server with your agent.

**Q: How do I handle PII?**
A: Trajectories are never logged. Use the built-in PII redaction for exports.

## Documentation

- **[AGENTS.md](./AGENTS.md)** — Agent development guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System design deep dive
- **[DEV_PLAN.md](./DEV_PLAN.md)** — Development checklist
- **[WALKTHROUGH.md](./WALKTHROUGH.md)** — Step-by-step walkthrough
- **[CLAUDE.md](./CLAUDE.md)** — Development guide

## License

MIT
