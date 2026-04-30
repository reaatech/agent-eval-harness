# agent-eval-harness

Evaluation harness for AI agent trajectories. Provides trajectory quality assessment, tool-use validation, cost tracking, latency monitoring, LLM-as-judge scoring, golden trajectory comparison, CI/CD regression gates, and MCP server integration.

**Package:** `@reaatech/agent-eval-harness` · MIT · Node.js >= 22 · ESM · pnpm

---

## What This Is

`agent-eval-harness` evaluates complete agent executions — multi-turn conversations with tool invocations. You feed it a trajectory (JSONL recording of an agent conversation) and it produces a structured evaluation covering quality, tool correctness, cost, and latency.

**Distinction from other eval tools:** This is not a classifier or single-response evaluator. It analyzes the full agent trajectory: every turn, every tool call, every latency measurement.

---

## Key Capabilities

| Capability | Module | Description |
|---|---|---|
| **Trajectory Evaluation** | `trajectory/` | Heuristic multi-turn quality assessment (coherence, goal completion, conversation flow) |
| **Tool-Use Validation** | `tool-use/` | 13 issue types for tool selection, 8 for result verification, plus JSON Schema compliance |
| **Cost Tracking** | `cost/` | Per-turn/trajectory cost with 8 supported model pricing tables and 3-tier budget alerts |
| **Latency Monitoring** | `latency/` | P50/P90/P99 percentile analysis, SLA enforcement, bottleneck detection |
| **LLM-as-Judge** | `judge/` | Provider-agnostic quality scoring (Claude, GPT-4, Gemini, OpenRouter) with calibration and consensus |
| **Golden Trajectories** | `golden/` | Reference trajectory creation, comparison, and curation workflow |
| **Suite Runner** | `suite/` | Batch evaluation orchestration with concurrency, results aggregation, and run comparison |
| **CI/CD Gates** | `gate/` | Threshold, baseline, and regression gates with JUnit XML, GitHub Annotations, and PR comments |
| **MCP Server** | `mcp-server/` | 13 MCP tools across 3 layers (judge/suite/gate) over stdio transport |
| **Observability** | `observability/` | OpenTelemetry tracing, 7 OTel metrics, structured logging (Pino) with PII redaction, in-memory dashboard |

---

## Quick Start

### Installation

```bash
npm install @reaatech/agent-eval-harness
# or
pnpm add @reaatech/agent-eval-harness
# or without installing
npx @reaatech/agent-eval-harness eval trajectories/*.jsonl
```

### Your First Evaluation

1. **Create a trajectory file** in JSONL format (one JSON object per line):

```jsonl
{"turn_id":1,"role":"user","content":"Reset my password","timestamp":"2026-04-15T23:00:00Z"}
{"turn_id":1,"role":"agent","content":"I can help with that. What's your email?","timestamp":"2026-04-15T23:00:01Z"}
{"turn_id":2,"role":"user","content":"john@example.com","timestamp":"2026-04-15T23:00:05Z"}
{"turn_id":2,"role":"agent","content":"Password reset sent! Check your inbox.","tool_calls":[{"name":"send_reset_email","arguments":{"email":"john@example.com"},"result":{"status":"sent"}}],"latency_ms":800,"cost":{"input_tokens":150,"output_tokens":45},"timestamp":"2026-04-15T23:00:06Z"}
```

2. **Run the evaluation:**

```bash
npx agent-eval-harness eval my-trajectory.jsonl --output results/
```

3. **View results:**

```bash
cat results/results.json
```

The evaluation produces an `AggregatedResults` JSON object with overall metrics (quality score, cost, latency percentiles), per-metric breakdowns, per-trajectory details, and summary statistics.

---

## Architecture

```
┌──────────────┐    ┌────────────────────┐    ┌──────────────┐
│  AI Agent    │───▶│ agent-eval-harness │───▶│  Evaluation  │
│ (Trajectory) │    │                    │    │   Results    │
└──────────────┘    └────────┬───────────┘    └──────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │ eval.judge.*│   │ eval.suite.*│   │ eval.gate.* │
   │  (Atomic)   │   │(Orchestrated)│   │  (CI Gates) │
   └─────────────┘   └─────────────┘   └─────────────┘
```

### Package Exports (12 subpath entry points)

| Export Path | Source | Purpose |
|---|---|---|
| `.` | `dist/index.js` | Main barrel — re-exports all public API |
| `./types` | `dist/types/index.js` | Core domain types and Zod schemas |
| `./trajectory` | `dist/trajectory/index.js` | Loader, evaluator, comparator |
| `./tool-use` | `dist/tool-use/index.js` | Validator, schema checker, result verifier |
| `./cost` | `dist/cost/index.js` | Tracker, budget manager, reporter |
| `./latency` | `dist/latency/index.js` | Monitor, budget enforcer, optimizer |
| `./judge` | `dist/judge/index.js` | Engine, calibration, prompts, cost tracker |
| `./golden` | `dist/golden/index.js` | Manager, comparator, curator |
| `./suite` | `dist/suite/index.js` | Runner, config, results, comparator |
| `./gate` | `dist/gate/index.js` | Engine, threshold gates, baseline gates, CI integration |
| `./mcp-server` | `dist/mcp-server/index.js` | MCP server factory and tools |
| `./observability` | `dist/observability/index.js` | Tracing, metrics, logger, dashboard |

---

## CLI Reference

Seven commands via Commander:

### `eval` — Run full evaluation

```bash
npx agent-eval-harness eval <paths...> [options]

Options:
  -g, --golden <path>       Path to golden trajectory for comparison
  -m, --metrics <metrics>   Comma-separated list of metrics to evaluate
  --judge-model <model>     Model for cost estimation (claude-opus, gpt-4, etc.)
  --no-judge                Disable LLM judge (default: judge is disabled in eval)
  --budget <budget>         Cost budget limit (default: "10.00")
  -f, --format <format>     Output format: json | csv (default: json)

Example:
  npx agent-eval-harness eval trajectories/*.jsonl -g golden/ref.jsonl -f json -o results/
```

The eval command runs heuristic trajectory evaluation (coherence, goal completion, flow), tool-use validation, cost calculation, and optional golden comparison. It outputs an `AggregatedResults` JSON file. **Note:** The eval command does not invoke the LLM judge — it uses rule-based heuristics. Use the `judge` command or the library API for LLM-based scoring.

### `judge` — Run LLM judge on a specific aspect

```bash
npx agent-eval-harness judge <aspect> [options]

Aspects: faithfulness | relevance | tool_correctness | overall

Options:
  -t, --trajectory <path>   Path to trajectory file
  --context <text>          Context for faithfulness evaluation
  --response <text>         Response to evaluate
  --intent <text>           User intent for relevance evaluation
  --model <model>           Model to use (default: claude-opus)
  --calibrated              Use calibrated scores

Examples:
  npx agent-eval-harness judge faithfulness --context "..." --response "..."
  npx agent-eval-harness judge overall -t my-trajectory.jsonl --model gpt-4
```

### `compare` — Compare two evaluation runs

```bash
npx agent-eval-harness compare <baseline> <candidate> [options]

Options:
  --statistical             Run statistical significance tests
  -f, --format <format>     Output: json | markdown | table (default: json)

Example:
  npx agent-eval-harness compare results/baseline.json results/candidate.json --statistical
```

Uses t-test, Cohen's d effect size, and regression/improvement detection. Exits 1 on regressions.

### `gate` — Check CI regression gates

```bash
npx agent-eval-harness gate <results> [options]

Options:
  --gates <path>            Path to gate configuration YAML (default: gates.yaml)
  --preset <preset>         Gate preset: standard | strict | lenient (default: standard)
  --exit-code               Return CI-compatible exit code (default: true)

Example:
  npx agent-eval-harness gate results/results.json --preset standard
```

### `golden` — Manage golden trajectories

```bash
npx agent-eval-harness golden [options]

Options:
  -l, --list                List all golden trajectories
  -c, --create <path>       Create new golden trajectory from file
  -u, --update <id>         Update existing golden trajectory
  -d, --delete <id>         Delete golden trajectory
  --validate <path>         Validate golden trajectory quality
  --dir <path>              Golden trajectories directory (default: golden)

Examples:
  npx agent-eval-harness golden --list
  npx agent-eval-harness golden -c trajectories/perfect-run.jsonl
  npx agent-eval-harness golden --validate golden/my-golden.jsonl
```

### `report` — Generate evaluation report

```bash
npx agent-eval-harness report <results> [options]

Options:
  -f, --format <format>     Output: html | markdown | json | pdf (default: markdown)
  -o, --output <path>       Output file path
  --template <path>         Custom report template
  --include-raw             Include raw trajectory data

Example:
  npx agent-eval-harness report results/results.json -f html -o report.html
```

Note: PDF format falls back to markdown.

### `serve` — Start MCP server

```bash
npx agent-eval-harness serve [options]

Options:
  -p, --port <port>         Server port (default: 3000)
  --host <host>             Server host (default: localhost)
  --transport <transport>   Transport type: http | stdio (default: http)

Example:
  npx agent-eval-harness serve
```

**Important:** Despite the CLI flags, the only fully implemented transport is `stdio` via `StdioServerTransport`. The `--port` and `--host` flags exist but stdio mode doesn't use them.

---

## Trajectory Format

### JSONL (one turn per line)

```jsonl
{"turn_id":1,"role":"user","content":"Reset my password","timestamp":"2026-04-15T23:00:00Z"}
{"turn_id":1,"role":"agent","content":"I can help with that. What's your email?","tool_calls":[],"latency_ms":1200,"timestamp":"2026-04-15T23:00:01Z"}
```

### Required Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `turn_id` | yes | number | Unique turn identifier within trajectory |
| `role` | yes | string | `"user"` or `"agent"` |
| `content` | yes | string | Message content |
| `timestamp` | yes | string | ISO-8601 timestamp |

### Optional Fields

| Field | Type | Applies To | Description |
|---|---|---|---|
| `tool_calls` | array | agent turns | Tool invocations (name, arguments, result) |
| `latency_ms` | number | agent turns | Turn latency in milliseconds |
| `cost` | object | agent turns | `{ input_tokens, output_tokens }` |

### Tool Call Structure

```json
{
  "name": "send_reset_email",
  "arguments": { "email": "john@example.com" },
  "result": { "status": "sent", "message_id": "msg-123" }
}
```

All fields are validated with Zod schemas on load. Missing required fields cause a `TrajectoryLoadError`. Turn sequence is validated (no missing turn_ids, alternating roles).

---

## Library API

### Trajectory Evaluation

```typescript
import { loadFromFile, evaluate, compare } from '@reaatech/agent-eval-harness';

const trajectory = await loadFromFile('./my-run.jsonl');
const result = evaluate(trajectory);
// result: { overall_score, metrics: { coherence, goal_completion, flow_quality, ... }, issues }

// Compare against golden
const comparison = compare(candidateTrajectory, goldenTrajectory);
// comparison: { similarity, tool_matches, content_matches, ... }
```

The trajectory evaluator is **heuristic-based** — it analyzes coherence between turns, detects goal completion indicators, and measures conversation flow quality. No LLM calls are made.

### Tool-Use Validation

```typescript
import { validateTrajectory, validateSchema, verifyResult, createToolSchema } from '@reaatech/agent-eval-harness';

const schemas = {
  send_reset_email: createToolSchema('send_reset_email', {
    type: 'object',
    properties: { email: { type: 'string', format: 'email' } },
    required: ['email'],
  }),
};

const results = validateTrajectory(trajectory, schemas);
// Returns array of ValidationResult with 13 possible issue types

const schemaCheck = validateSchema(toolCall, schemas.send_reset_email);
// JSON Schema validation via ajv

const resultCheck = verifyResult(toolCall, turn, trajectory);
// Hallucination detection, contradiction checks (8 issue types)
```

**13 tool selection issue types:** `missing_tool_name`, `missing_arguments`, `invalid_arguments`, `tool_not_found`, `tool_misuse`, `missing_result`, `result_unused`, `hallucinated_result`, `schema_violation`, `type_mismatch`, `missing_required_param`, `unknown_tool`, `deprecated_tool`

**8 result verification issue types:** `missing_result`, `empty_result`, `error_result`, `hallucinated_content`, `unused_result`, `contradicts_response`, `incomplete_integration`, `malformed_result`

### Cost Tracking

```typescript
import { calculateTrajectoryCost, checkBudget, createBudget, generateCostReport } from '@reaatech/agent-eval-harness';

const breakdown = calculateTrajectoryCost(trajectory, 'claude-opus');
// breakdown: { total_cost, llm_calls, tool_invocations, per_turn: [...] }

const budget = createBudget('moderate'); // or 'strict' | 'lenient'
const status = checkBudget(breakdown.total_cost, budget);

const report = generateCostReport(trajectories);
const csv = report.exportToCsv();
```

**8 supported models with built-in pricing:**

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| claude-opus | $15.00 | $75.00 |
| claude-sonnet | $3.00 | $15.00 |
| claude-haiku | $0.25 | $1.25 |
| gpt-4 | $30.00 | $60.00 |
| gpt-4-turbo | $10.00 | $30.00 |
| gpt-4-mini | $3.00 | $10.00 |
| gemini-pro | $2.50 | $7.50 |
| gemini-flash | $0.075 | $0.30 |

**Budget presets:**

| Preset | Per Task | Per Trajectory | Daily |
|---|---|---|---|
| `strict` | $0.01 | $0.50 | $10.00 |
| `moderate` | $0.05 | $1.00 | $50.00 |
| `lenient` | $0.10 | $5.00 | $100.00 |

3-tier alert thresholds: 50% usage → log, 75% → warn, 90% → block.

Token counting uses a heuristic (~4 chars per token) as default, with optional tiktoken-based accurate counting.

### Latency Monitoring

```typescript
import { monitorLatency, enforceBudget, createLatencyBudget, analyzeOptimization } from '@reaatech/agent-eval-harness';

const result = monitorLatency(trajectory);
// result: { p50Ms, p90Ms, p99Ms, minMs, maxMs, avgMs, componentBreakdown }

const budget = createLatencyBudget('moderate');
const enforcement = enforceBudget(result, budget);
// Checks per-turn p50/p90/p99 and trajectory total thresholds

const optimization = analyzeOptimization(result, trajectory);
// Identifies bottlenecks and gives 10 types of optimization recommendations
```

**Latency presets:**

| Preset | P50 | P90 | P99 | Trajectory Total |
|---|---|---|---|---|
| `strict` | 500ms | 1000ms | 2000ms | 15s |
| `moderate` | 1000ms | 2000ms | 5000ms | 30s |
| `lenient` | 2000ms | 4000ms | 10000ms | 60s |

### LLM Judge

```typescript
import { JudgeEngine, JudgeCalibrator, ConsensusEngine } from '@reaatech/agent-eval-harness';

const judge = new JudgeEngine({
  model: 'claude-opus',
  provider: 'claude',
  temperature: 0.1,
});
const result = await judge.judge({
  type: 'faithfulness',
  context: 'User account: john@example.com',
  response: 'Sent password reset to john@example.com',
});
// result: { score, explanation, confidence }
```

**4 providers:** `claude` (Anthropic SDK), `gpt4` (OpenAI SDK), `gemini` (Google Generative AI), `openrouter` (OpenAI-compatible endpoint).

**Judge types:** `faithfulness`, `relevance`, `tool_correctness`, `overall_quality`.

**Calibration methods:** `temperature_scaling` (grid search minimizes MAE), `isotonic_regression`, `linear`.

The judge engine includes rate limiting per provider, exponential backoff retry (3 attempts), fallback model support, and a mock mode (`JUDGE_MOCK='true'` returns score=0.85).

### Golden Trajectories

```typescript
import { createGolden, compareAgainstGolden, quickCreateGolden, createCurator } from '@reaatech/agent-eval-harness';

// Quick creation
const golden = quickCreateGolden(trajectory, 'password-reset', ['auth']);

// Comparison
const result = compareAgainstGolden(golden, candidateTrajectory, { similarityThreshold: 0.85 });
// result: { similarity, regressions, improvements }

// Curation workflow
const curator = createCurator(trajectory);
curator.annotateTurn(0, 'Polite greeting', true);
curator.runQualityChecks();
const curated = curator.publish();
```

Golden trajectories are stored as JSONL with metadata annotations (`_golden_metadata`) marking expected turn behavior and quality notes.

### Suite Runner

```typescript
import { SuiteRunner, parseConfig, ResultsAggregator } from '@reaatech/agent-eval-harness';

const config = parseConfig(yamlConfigString);
const runner = new SuiteRunner({ concurrency: 5, timeout: 60000 });
const result = await runner.run(trajectories, evaluator);

const aggregator = new ResultsAggregator();
const aggregated = aggregator.aggregate([result]);
// Export: aggregated.toJSON(), aggregated.toJUnit(), aggregated.toCSV(), aggregated.toMarkdown()
```

Default suite config evaluates 5 metrics: faithfulness, relevance, tool_correctness, cost, and latency, each with equal weight.

### Gate Engine

```typescript
import { createGateEngine, getStandardPreset, getStrictPreset, getLenientPreset } from '@reaatech/agent-eval-harness';

const standard = getStandardPreset();
const engine = createGateEngine(standard.gates);
const summary = engine.evaluate(results);
// summary: { passed, failed, gates: [...], durationMs }

// CI Integration
import { writeJUnitReport, outputGitHubAnnotations, exportForCI } from '@reaatech/agent-eval-harness';
exportForCI(summary, './reports/');
```

**Gate presets (threshold values):**

| Preset | Quality | Faithfulness | Relevance | Tool | Cost | Latency P99 | Pass Rate | SLA Violations |
|---|---|---|---|---|---|---|---|---|
| **standard** | >= 0.80 | >= 0.80 | >= 0.80 | >= 0.90 | <= $0.05 | <= 5000ms | >= 95% | — |
| **strict** | >= 0.90 | >= 0.90 | >= 0.90 | >= 0.95 | <= $0.02 | <= 2000ms | >= 99% | 0 |
| **lenient** | >= 0.60 | >= 0.60 | >= 0.60 | >= 0.70 | <= $0.10 | <= 10000ms | — | — |

4 gate types supported: `threshold` (6 operators), `baseline-comparison`, `regression`, and `custom`. Gate evaluation results are cached for 1 hour (TTL).

---

## MCP Server

The harness exposes 13 MCP tools across 3 layers over **stdio transport** (`StdioServerTransport`). All state is in-memory (no persistence between restarts).

```bash
npx agent-eval-harness serve
# or programmatically:
import { createMCPServer } from '@reaatech/agent-eval-harness/mcp-server';
await createMCPServer();
```

### Layer 1: eval.judge.* (Atomic — stateless, fast)

| Tool | Input | Output |
|---|---|---|
| `eval.judge.faithfulness` | `{ context, response }` | `{ score, explanation, confidence }` |
| `eval.judge.relevance` | `{ intent, response }` | `{ score, explanation, confidence }` |
| `eval.judge.tool_correctness` | `{ expected_tool, actual_tool, arguments?, result? }` | `{ score, explanation, confidence }` |
| `eval.judge.cost_check` | `{ trajectory, budget }` | `{ within_budget, cost, budget, usage_percentage }` |
| `eval.judge.latency_check` | `{ trajectory, sla }` | `{ within_sla, p99_ms, p50_ms, p90_ms, total_ms }` |

### Layer 2: eval.suite.* (Orchestrated — stateful, in-memory)

| Tool | Input | Output |
|---|---|---|
| `eval.suite.run` | `{ trajectories, config? }` | `{ run_id, status, total_trajectories, completed, failed, duration_ms }` |
| `eval.suite.status` | `{ run_id }` | `{ run_id, status, progress, completed, total, started_at, ended_at }` |
| `eval.suite.results` | `{ run_id, format? }` | AggregatedResults (JSON) or summary |
| `eval.suite.compare` | `{ baseline_run, candidate_run }` | `{ score_diff, verdict, regressions, improvements, key_findings }` |
| `eval.suite.baseline` | `{ run_id, name? }` | `{ baseline_id, name, set_at }` |

**Note:** Suite tools use a mock evaluator (always returns score=0.85). For real evaluation, use the library API directly.

### Layer 3: eval.gate.* (CI — opinionated, blocking)

| Tool | Input | Output |
|---|---|---|
| `eval.gate.run` | `{ run_id?, gate_config?, results? }` | `{ passed, total_gates, passed_gates, failed_gates, results, exit_code }` |
| `eval.gate.config` | `{ action, config?, preset? }` | Gate list or `{ success, gates_loaded }` |
| `eval.gate.diff` | `{ baseline, candidate, metrics? }` | `{ score_diff, metric_diffs, regressions, improvements, verdict }` |

---

## Observability

### OpenTelemetry Tracing

Span hierarchy per evaluation run: `eval.run` → `trajectory.load` → `judge.evaluate` (per batch) → `gate.check`.

```typescript
import { getTracingManager, withTracing } from '@reaatech/agent-eval-harness';

await withTracing('my_operation', async () => { /* ... */ });
```

Exporters: OTLP (gRPC), Zipkin, Console.

### Metrics (7 OTel Instruments)

| Metric | Type | Description |
|---|---|---|
| `agent_eval.runs.total` | Counter | Total evaluation runs |
| `agent_eval.trajectories.evaluated` | Counter | Trajectories processed |
| `agent_eval.judge.calls` | Counter | LLM judge API calls |
| `agent_eval.judge.cost` | Histogram | Judge cost per run |
| `agent_eval.gates.result` | Histogram | Gate pass/fail (1/0) |
| `agent_eval.cost.per_task` | Histogram | Cost per task |
| `agent_eval.latency.p99` | Histogram | P99 latency per run |

### Structured Logging (Pino)

```typescript
import { getLogger, setGlobalRunId } from '@reaatech/agent-eval-harness';

const logger = getLogger();
setGlobalRunId('eval-123');
logger.info('Evaluation complete', { trajectories: 50, overall_score: 0.87 });
```

PII is automatically redacted from logs — 7 regex patterns for emails, phones, SSNs, passwords, API keys, tokens, and secrets. Field-level redaction for `password`, `secret`, `token`, `apiKey`, `api_key`, `authorization`.

### In-Memory Dashboard

```typescript
import { getDashboardManager } from '@reaatech/agent-eval-harness';

const dashboard = getDashboardManager();
dashboard.recordRun({ runId: 'eval-123', overallScore: 0.87, cost: 12.34, p99Ms: 3200 });
const panel = dashboard.getPanel('quality');
```

4 panels (Quality, Performance, Statistics, Alerts), linear regression trend analysis, 24-hour data retention.

---

## CI/CD Integration

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
        run: npx agent-eval-harness eval trajectories/*.jsonl -f json -o results/
      - name: Check gates
        run: npx agent-eval-harness gate results/results.json --preset standard --exit-code
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: results/
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
    metric: cost
    operator: "<="
    threshold: 0.05
  - name: latency-p99
    type: threshold
    metric: latency
    operator: "<="
    threshold: 5000
  - name: no-regression
    type: baseline-comparison
    baseline: results/baseline.json
    metric: overall_score
    allow_regression: false
```

### CI Integration API

```typescript
import { CIIntegration, writeJUnitReport, exportForCI } from '@reaatech/agent-eval-harness';

const summary = gateEngine.evaluate(results);

writeJUnitReport(summary, './reports/junit.xml');
console.log(CIIntegration.generatePRComment(summary));
process.exit(CIIntegration.getExitCode(summary)); // 0=pass, 1=fail
exportForCI(summary, './reports/');
```

---

## Docker

### Standalone

```bash
docker build -t agent-eval-harness .
docker run -v ./trajectories:/app/trajectories -v ./results:/app/results \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  agent-eval-harness eval trajectories/*.jsonl
```

### MCP Server (stdio)

```bash
docker run -i agent-eval-harness serve
```

### Full Observability Stack

```bash
docker-compose up -d
# Jaeger: http://localhost:16686
# Grafana: http://localhost:3001
# Prometheus: http://localhost:9090
```

---

## Testing

```bash
pnpm test               # All tests (vitest)
pnpm test:unit          # Unit tests only (8 files)
pnpm test:integration   # Integration tests (1 file)
pnpm test:coverage      # With coverage (80% threshold enforced)
pnpm test:watch         # Watch mode
```

```bash
pnpm lint               # Biome linter
pnpm format             # Biome formatter
pnpm typecheck          # TypeScript --noEmit
```

```
tests/
├── unit/                  # 8 unit test files
│   ├── trajectory.test.ts
│   ├── tool-use.test.ts
│   ├── cost.test.ts
│   ├── latency.test.ts
│   ├── judge.test.ts
│   ├── gate.test.ts
│   ├── golden.test.ts
│   └── suite.test.ts
├── integration/
│   └── eval-pipeline.test.ts  # Full end-to-end pipeline
└── fixtures/                   # Test fixture data
```

---

## Security

- **PII redaction:** Field-level redaction in all logs via regex (emails, phones, SSNs, API keys, passwords, tokens, secrets)
- **API keys:** All provider keys from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`); never logged
- **Cost controls:** 3-tier budget alerts (50% log, 75% warn, 90% block), daily cumulative tracking
- **No secrets in logs:** Pino redact configuration strips `password`, `secret`, `token`, `apiKey`, `api_key`, `authorization`

---

## Documentation

| Document | Purpose |
|---|---|
| [AGENTS.md](./AGENTS.md) | Full agent development guide with API reference, MCP tools, CI patterns |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design deep dive, component diagrams, data flow |
| [DEV_PLAN.md](./DEV_PLAN.md) | Development checklist (18 phases, all complete) |
| [WALKTHROUGH.md](./WALKTHROUGH.md) | Step-by-step walkthrough |
| [CLAUDE.md](./CLAUDE.md) | Developer reference for extending the harness |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| `skills/` (10 files) | Domain-specific guides (trajectory eval, tool-use, cost, latency, judge, golden, suites, faithfulness, relevance, gating) |
| `trajectories/examples/` | Example trajectories and config |

---

## License

MIT
