# agent-eval-harness — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │     CLI     │    │   Library   │    │  MCP Client │                  │
│  │   (npx)     │    │  (import)   │    │  (Agent)    │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │                                               │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Evaluation Core                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Three-Layer Architecture                     │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │ eval.judge.*│───▶│ eval.suite.*│───▶│  eval.gate.*│           │   │
│  │  │  (Atomic)   │    │(Orchestrated)│   │   (CI)      │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Evaluation Engine                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Trajectory  │  │  Tool-Use   │  │    Cost     │  │  Latency    │    │
│  │  Evaluator  │  │  Validator  │  │   Tracker   │  │   Monitor   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                 │                │                │           │
│         └─────────────────┼────────────────┼────────────────┘           │
│                           ▼                                            │
│                  ┌─────────────────┐                                    │
│                  │    LLM Judge    │                                    │
│                  │   (Calibrated)  │                                    │
│                  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cross-Cutting Concerns                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  Golden Manager  │  │   Observability  │  │  Reproducibility │       │
│  │  - Versioning    │  │  - Tracing (OTel)│  │  - Seed mgmt     │       │
│  │  - Comparison    │  │  - Metrics (OTel)│  │  - Deterministic │       │
│  │  - Curation      │  │  - Logging (pino)│  │  - Versioning    │       │
│  │                  │  │  - Dashboard     │  │                  │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
│  ┌──────────────────┐  ┌──────────────────┐                             │
│  │  MCP Server      │  │  CLI (7 commands)│                             │
│  │  - stdio transport│  │  - Commander     │                             │
│  │  - 13 tools      │  │  - 6 subcommands │                             │
│  └──────────────────┘  └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Three-Layer Architecture
- **eval.judge.*** — Atomic, stateless operations for mid-task self-evaluation
- **eval.suite.*** — Orchestrated runs for eval-driven development
- **eval.gate.*** — CI-style pass/fail gates for regression prevention

### 2. Provider-Agnostic
- Any LLM provider can be used for judging (Claude, GPT-4, Gemini, open-source)
- Unified interface for all providers
- Provider-specific optimizations are encapsulated

### 3. Reproducibility First
- Same inputs always produce same outputs (deterministic seed management)
- Version all configuration and golden trajectories
- Track eval run metadata for auditability

### 4. Cost-Aware Evaluation
- LLM-as-judge costs tracked per-request
- Budget limits enforced (soft and hard)
- Cost estimation before running expensive operations

### 5. CI-Native Design
- Exit codes suitable for automation
- JUnit XML and GitHub Actions output formatting
- Fast gate evaluation with caching

### 6. Comprehensive Observability
- OpenTelemetry tracing for every evaluation run
- Metrics exported as OTel instruments (7 metrics)
- Structured logging with PII redaction
- In-memory dashboard for trend tracking

---

## Component Deep Dive

### Three-Layer MCP Tool Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Layer 1: eval.judge.* (Atomic)                     │
│                                                                      │
│  Fast, stateless, composable operations for mid-task self-evaluation │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   faithfulness  │    │    relevance    │    │ tool_correctness│  │
│  │                 │    │                 │    │                 │  │
│  │ Score response  │    │ Score response  │    │ Validate tool   │  │
│  │ faithfulness to │    │ relevance to    │    │ call correctness│  │
│  │ context         │    │ user intent     │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │    cost_check   │    │   latency_check │                         │
│  │                 │    │                 │                         │
│  │ Verify cost     │    │ Verify latency  │                         │
│  │ within budget   │    │ within SLA      │                         │
│  └─────────────────┘    └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                Layer 2: eval.suite.* (Orchestrated)                  │
│                                                                      │
│  Stateful, longer-running operations for eval-driven development     │
│  (in-memory Maps per session, inline trajectory objects)             │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │      run        │    │     status      │    │     results     │  │
│  │                 │    │                 │    │                 │  │
│  │ Execute full    │    │ Get evaluation  │    │ Retrieve eval   │  │
│  │ evaluation suite│    │ run status      │    │ results         │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │     compare     │    │     baseline    │                         │
│  │                 │    │                 │                         │
│  │ Compare two     │    │ Set/update      │                         │
│  │ evaluation runs │    │ baseline        │                         │
│  └─────────────────┘    └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Layer 3: eval.gate.* (CI Gates)                   │
│                                                                      │
│  Opinionated, blocking operations for CI/CD                          │
│  (in-memory gate storage, accepts inline results)                    │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │       run       │    │     config      │    │       diff      │  │
│  │                 │    │                 │    │                 │  │
│  │ Run CI-style    │    │ Get/set/list    │    │ Get detailed    │  │
│  │ pass/fail gate  │    │ gate config     │    │ diff from base  │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Trajectory Evaluator

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Trajectory Evaluator                             │
│                                                                      │
│  Input: Trajectory (JSONL format, one turn per line)                │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Loader       │    │   Evaluator     │    │   Comparator    │  │
│  │                 │    │                 │    │                 │  │
│  │ - JSONL parsing │    │ - Multi-turn    │    │ - Golden        │  │
│  │ - Validation    │    │   quality       │    │   comparison    │  │
│  │ - Reconstruction│    │ - Coherence     │    │ - Diff          │  │
│  │                 │    │ - Goal          │    │ - Similarity    │  │
│  │                 │    │   completion    │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  Output: EvalResult { quality_score, coherence, goal_completed, ... }│
└─────────────────────────────────────────────────────────────────────┘
```

### Tool-Use Validator

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Tool-Use Validator                                │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Validator    │    │  Schema Checker │    │ Result Verifier │  │
│  │                 │    │                 │    │                 │  │
│  │ - Tool          │    │ - JSON Schema   │    │ - Result usage  │  │
│  │   selection     │    │   validation    │    │ - Hallucination │  │
│  │ - Correctness   │    │ - Type checking │    │   detection     │  │
│  │ - Misuse        │    │ - Required vs   │    │ - Integration   │  │
│  │   detection     │    │   optional      │    │   validation    │  │
│  │ (13 issue types)│    │ - Format checks │    │ (8 issue types) │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  Output: ValidationResult { valid, issues, suggestions }            │
└─────────────────────────────────────────────────────────────────────┘
```

### Cost Tracker

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Cost Tracker                                   │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Tracker      │    │ Budget Manager  │    │    Reporter     │  │
│  │                 │    │                 │    │                 │  │
│  │ - Per-request   │    │ - Budget        │    │ - Cost per      │  │
│  │   cost          │    │   enforcement   │    │   trajectory    │  │
│  │ - Provider-     │    │ - Alerts and    │    │ - Cost per tool │  │
│  │   agnostic      │    │   warnings      │    │ - Trends        │  │
│  │ - Component     │    │ - 3 presets     │    │ - Export (CSV,  │  │
│  │   breakdown     │    │ - Optimization  │    │   JSON)         │  │
│  │ - 8 model prices│    │   recommend     │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  Output: CostBreakdown { total_cost, per_component, per_turn }      │
└─────────────────────────────────────────────────────────────────────┘
```

### LLM Judge with Calibration

```
┌─────────────────────────────────────────────────────────────────────┐
│                  LLM Judge with Calibration                          │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Engine       │    │   Calibrator    │    │    Prompts      │  │
│  │                 │    │                 │    │                 │  │
│  │ - 4 providers   │    │ - 3 methods:    │    │ - Faithfulness  │  │
│  │   (claude, gpt4,│    │   temp_scaling, │    │ - Relevance     │  │
│  │   gemini,       │    │   isotonic,     │    │ - Tool          │  │
│  │   openrouter)   │    │   linear        │    │   correctness   │  │
│  │ - Batch         │    │ - MAE-based     │    │ - Overall       │  │
│  │   processing    │    │   grid search   │    │   quality       │  │
│  │ - Rate limiting │    │ - Consensus     │    │ - Custom        │  │
│  │ - Retry logic   │    │   engine (3     │    │   templates     │  │
│  │ - Mock mode     │    │   strategies)   │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  Output: JudgeScore { score, explanation, confidence, calibrated }  │
└─────────────────────────────────────────────────────────────────────┘
```

### Golden Trajectory Management

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Golden Trajectory Management                        │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Manager      │    │   Comparator    │    │    Curator      │  │
│  │                 │    │                 │    │                 │  │
│  │ - Load JSONL    │    │ - Jaccard       │    │ - Curation      │  │
│  │ - Validate       │    │   similarity   │    │   workflow      │  │
│  │ - Version       │    │ - Tool call     │    │ - Auto-annotate │  │
│  │ - Filter by     │    │   comparison    │    │ - Quality       │  │
│  │   tags/scenario │    │ - Regression    │    │   checks        │  │
│  │ - CRUD ops      │    │   detection     │    │ - Batch ops     │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Suite Runner and Results

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Suite Orchestration                               │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Runner       │    │     Config      │    │    Results      │  │
│  │                 │    │                 │    │                 │  │
│  │ - Parallel exec │    │ - YAML parsing  │    │ - Aggregate     │  │
│  │ - Concurrency   │    │ - Validation    │    │ - Per-metric    │  │
│  │   control       │    │ - Defaults       │    │   breakdown     │  │
│  │ - Progress      │    │ - Merging       │    │ - 4 export      │  │
│  │   callbacks     │    │ - Metric        │    │   formats:      │  │
│  │ - Timeouts      │    │   weighting     │    │   JSON, JUnit,  │  │
│  │ - Error recov   │    │ - Thresholds    │    │   CSV, Markdown │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Comparator                                │  │
│  │  - Statistical testing (t-test)                                │  │
│  │  - Cohen's d effect size                                       │  │
│  │  - Regression/improvement detection                            │  │
│  │  - Visualization data generation                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### CI Regression Gates

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CI Regression Gates                              │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Engine       │    │ Threshold Gates │    │ Baseline Gates  │  │
│  │                 │    │                 │    │                 │  │
│  │ - 4 gate types  │    │ - 8 factories   │    │ - 4 factories   │  │
│  │ - Result caching│    │ - 3 presets     │    │ - Regression    │  │
│  │   (1hr TTL)     │    │   (standard,    │    │   detection     │  │
│  │ - 6 operators   │    │    strict,      │    │ - Improvement   │  │
│  │ - Aggregation   │    │    lenient)     │    │   requirements  │  │
│  │ - Custom gates  │    │ - Config builder│    │ - Significance  │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    CI Integration                              │  │
│  │  - GitHub Annotations generator                               │  │
│  │  - JUnit XML reporter                                         │  │
│  │  - PR comment generator                                       │  │
│  │  - Step summary output                                        │  │
│  │  - Environment variable exporter                              │  │
│  │  - Exit code management (0=pass, 1=fail)                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Observability Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Observability Stack                            │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │    Tracing      │    │    Metrics      │    │    Logging      │  │
│  │                 │    │                 │    │                 │  │
│  │ - NodeTracer    │    │ - MeterProvider │    │ - Pino logger   │  │
│  │   Provider      │    │ - 7 instruments │    │ - PII redaction │  │
│  │ - 3 exporters:  │    │   (Counter x3,  │    │ - Run ID        │  │
│  │   OTLP, Zipkin, │    │    Histogram x4)│    │   correlation   │  │
│  │   Console       │    │ - Console       │    │ - Pretty print  │  │
│  │ - 4 span types: │    │   exporter      │    │   (dev) vs JSON │  │
│  │   eval.run,     │    │                 │    │   (prod)        │  │
│  │   trajectory    │    │                 │    │                 │  │
│  │   .load, judge  │    │                 │    │                 │  │
│  │   .evaluate,    │    │                 │    │                 │  │
│  │   gate.check    │    │                 │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Dashboard (In-Memory)                       │  │
│  │  - 4 panels: Quality, Performance, Statistics, Alerts         │  │
│  │  - Linear regression trend analysis                           │  │
│  │  - 4 alert types: score, cost, latency, pass rate             │  │
│  │  - 24-hour data retention                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Complete Evaluation Flow

```
1. Load trajectory (JSONL format)
        │
2. Validate trajectory structure:
   - Required fields present (turn_id, role, content, timestamp)
   - Valid turn sequence
   - Agent turns include tool_calls array
        │
3. Evaluate trajectory quality:
   - Multi-turn coherence (rule-based heuristic analysis)
   - Goal completion verification
   - Conversation flow analysis
        │
4. Validate tool-use:
   - Correct tool selection (13 issue types)
   - Argument schema validation (JSON Schema via ajv)
   - Result verification (8 issue types, hallucination detection)
        │
5. Calculate costs:
   - Per-turn token estimation (chars/4 heuristic or tiktoken)
   - Provider-specific pricing (8 models supported)
   - Budget compliance check (3-tier alert thresholds)
        │
6. Check latency:
   - Per-turn latency measurement
   - P50/P90/P99 percentile calculation
   - SLA threshold verification (8 violation types)
   - Component breakdown (LLM, tool, overhead)
        │
7. Run LLM judge (if configured):
   - Faithfulness scoring
   - Relevance scoring
   - Overall quality assessment
   - Provider-agnostic engine (4 providers, rate limiting, retry logic)
        │
8. Compare against golden (if available):
   - Jaccard similarity calculation
   - Tool call comparison
   - Diff summary generation
   - Regression detection
        │
9. Aggregate results:
   - Overall score calculation (weighted metrics)
   - Per-metric breakdown (avg, min, max, stdDev, passRate)
   - Summary statistics
        │
10. Evaluate gates (if configured):
    - Threshold checks (6 operators)
    - Baseline comparison
    - Statistical significance testing (t-test, Cohen's d)
    - Pass/fail determination
    - Result caching (1 hour TTL)
        │
11. Export results:
    - JSON report (full AggregatedResults)
    - JUnit XML (test reporter compatible)
    - CSV (spreadsheet importable)
    - Markdown (human-readable summary)
    - GitHub Annotations / PR comment
```

---

## MCP Server Implementation

### Transport

The MCP server uses **stdio transport only** via `StdioServerTransport` from `@modelcontextprotocol/sdk`. No HTTP transport is available. The server runs as a child process communicating over stdin/stdout with a single MCP client.

### Tool Registration

All 13 tools are registered programmatically as arrays of `Tool` objects conforming to the MCP specification. Each tool has:
- **name**: Fully qualified MCP tool name (e.g., `eval.judge.faithfulness`)
- **description**: Human-readable description
- **inputSchema**: JSON Schema for input validation (also validated via Zod at runtime)

### Memory Model

All state (active runs, aggregated results, gate configuration, gate results) is stored in in-memory `Map` instances. State is **not persisted** between server restarts.

### Tool Inventory

| Layer | Tool | File |
|-------|------|------|
| Layer 1 | `eval.judge.faithfulness` | `mcp-server/tools/judge/index.ts` |
| Layer 1 | `eval.judge.relevance` | `mcp-server/tools/judge/index.ts` |
| Layer 1 | `eval.judge.tool_correctness` | `mcp-server/tools/judge/index.ts` |
| Layer 1 | `eval.judge.cost_check` | `mcp-server/tools/judge/index.ts` |
| Layer 1 | `eval.judge.latency_check` | `mcp-server/tools/judge/index.ts` |
| Layer 2 | `eval.suite.run` | `mcp-server/tools/suite/index.ts` |
| Layer 2 | `eval.suite.status` | `mcp-server/tools/suite/index.ts` |
| Layer 2 | `eval.suite.results` | `mcp-server/tools/suite/index.ts` |
| Layer 2 | `eval.suite.compare` | `mcp-server/tools/suite/index.ts` |
| Layer 2 | `eval.suite.baseline` | `mcp-server/tools/suite/index.ts` |
| Layer 3 | `eval.gate.run` | `mcp-server/tools/gate/index.ts` |
| Layer 3 | `eval.gate.config` | `mcp-server/tools/gate/index.ts` |
| Layer 3 | `eval.gate.diff` | `mcp-server/tools/gate/index.ts` |

---

## CLI Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLI (Commander)                               │
│                                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │  eval   │  │  judge  │  │ compare │  │  gate   │  │ golden  │   │
│  │         │  │         │  │         │  │         │  │         │   │
│  │ Load    │  │ Run     │  │ Load 2  │  │ Load    │  │ List    │   │
│  │ JSONL   │  │ LLM     │  │ results │  │ results │  │ Create  │   │
│  │ files   │  │ judge   │  │ files   │  │ file    │  │ Update  │   │
│  │ Eval    │  │ directly│  │ Run     │  │ Run     │  │ Validate│   │
│  │ each    │  │         │  │ compar  │  │ gates   │  │ Delete  │   │
│  │ traj    │  │         │  │         │  │         │  │         │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
│                                                                       │
│  ┌──────────────┐  ┌──────────────────┐                              │
│  │    report    │  │      serve       │                              │
│  │              │  │                  │                              │
│  │ Generate     │  │ Start MCP server │                              │
│  │ HTML/MD/JSON │  │ (stdio transport)│                              │
│  │ reports      │  │                  │                              │
│  └──────────────┘  └──────────────────┘                              │
│                                                                       │
│  Global options: -v (verbose), -c (config), -o (output)              │
└──────────────────────────────────────────────────────────────────────┘
```

### Command File Reference

| Command | File | Lines | Key Output |
|---------|------|-------|------------|
| `eval` | `cli/commands/eval.command.ts` | 323 | `AggregatedResults` as JSON/CSV |
| `judge` | `cli/commands/judge.command.ts` | 104 | `JudgeScore` JSON |
| `compare` | `cli/commands/compare.command.ts` | 127 | `RunComparison` as JSON/MD/table |
| `gate` | `cli/commands/gate.command.ts` | 80 | JUnit XML + GitHub annotations |
| `golden` | `cli/commands/golden.command.ts` | 227 | Golden trajectory CRUD |
| `report` | `cli/commands/report.command.ts` | 130 | HTML/MD/JSON report |
| `serve` | `cli.ts` (inline) | - | Starts MCP server |

---

## Test Architecture

```
tests/
├── unit/                                # 8 files, ~9,100 lines total
│   ├── trajectory.test.ts    (1,240 L)  # Loader, evaluator, comparator
│   ├── tool-use.test.ts      (1,075 L)  # Validator, schema checker, result verifier
│   ├── cost.test.ts          (  970 L)  # Tracker, budget manager, reporter
│   ├── latency.test.ts       (1,038 L)  # Monitor, budget enforcer, optimizer
│   ├── judge.test.ts         (1,095 L)  # Engine, calibration, cost tracker, prompts
│   ├── gate.test.ts          (1,471 L)  # Engine, threshold, baseline, CI integration
│   ├── golden.test.ts        (1,429 L)  # Manager, comparator, curator
│   └── suite.test.ts         (1,781 L)  # Config, runner, results, comparator
├── integration/
│   └── eval-pipeline.test.ts (1,093 L)  # Full end-to-end pipeline
└── fixtures/                            # Test fixture data directory
    └── .gitkeep                         # Currently empty (inline test data used)
```

### Test Infrastructure

- **Framework**: Vitest with `globals: true`, `environment: 'node'`
- **Coverage**: v8 provider, 80% thresholds (statements/branches/functions/lines)
- **Path alias**: `@` → `./src`
- **Report output**: `./reports/junit.xml`, `./reports/test-results.json`
- **Test approach**: Mock-heavy for external dependencies (LLM APIs), inline test data generation via helper functions, deterministic assertions

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Data                                                        │
│ - PII redaction in all logs (regex: emails, phones, SSNs, API keys, │
│   passwords, tokens)                                                 │
│ - Hash sensitive identifiers                                        │
│ - Never log raw trajectory content (field-level redaction)          │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: API Keys                                                    │
│ - All LLM API keys from environment variables                       │
│   (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY)               │
│ - Never log API keys or tokens (pino redact config)                 │
│ - Separate keys per provider for isolation                          │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Cost Controls                                               │
│ - Budget limits enforced per task/trajectory/daily                  │
│ - 3-tier alerts: 50% log, 75% notify, 90% block                    │
│ - Cost estimation before expensive operations                       │
│ - Cumulative daily budget tracking                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Export Security                                             │
│ - PII sanitization before export                                    │
│ - Configurable data retention                                       │
│ - Secure transport (HTTPS) for remote exporters                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

Six cloud platforms are supported via Terraform modules in `infra/`:

### GCP Cloud Run (Primary)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Run Service                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  agent-eval-harness Container                 │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ Eval      │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Engine    │  │ Sidecar   │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Min instances: 0 (scale to zero)                                 │
│  - Max instances: 5 (configurable)                                  │
│  - Memory: 512Mi-1GB, CPU: 500m-1 vCPU                              │
│  - Concurrency: 40                                                   │
│  - Timeout: 300s (for large evals)                                  │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
│  Storage: GCS for trajectories and results                          │
└─────────────────────────────────────────────────────────────────────┘
```

### AWS ECS Fargate

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS ECS Fargate                             │
│                                                                      │
│  Services:                                                           │
│  - ECS Fargate task (CPU/Mem configurable)                          │
│  - RDS PostgreSQL (state storage)                                    │
│  - ElastiCache Redis (caching)                                      │
│  - S3 (trajectories, results)                                       │
│  - Secrets Manager (API keys)                                       │
│                                                                      │
│  Modules: `infra/modules/aws-ecs/`, `aws-rds/`, `aws-redis/`,      │
│           `aws-s3/`, `aws-secrets/`                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Azure Container Apps

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Azure Container Apps                            │
│                                                                      │
│  Services:                                                           │
│  - Container Apps (serverless containers)                           │
│  - Azure Database for PostgreSQL                                    │
│  - Azure Cache for Redis                                            │
│  - Blob Storage (trajectories, results)                             │
│                                                                      │
│  Module: `infra/modules/azure-container-apps/`                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Additional Platforms

| Platform | Compute | Module |
|----------|---------|--------|
| **OCI** | OKE (Kubernetes) + Object Storage | `infra/modules/oci-oke/` |
| **Netlify** | Serverless Functions | `infra/modules/netlify/` |
| **Vercel** | Serverless Functions | `infra/modules/vercel/` |

---

## Docker Architecture

### Multi-Stage Dockerfile

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Stage 1       │     │   Stage 2       │     │   Stage 3       │
│   (builder)     │     │   (prod-deps)   │     │   (runtime)     │
│                 │     │                 │     │                 │
│ node:22-alpine  │────▶│ node:22-alpine  │────▶│ node:22-alpine  │
│ pnpm install    │     │ pnpm install    │     │ copy dist/      │
│ pnpm build      │     │ --prod          │     │ copy prod deps  │
│                 │     │                 │     │ non-root user   │
│                 │     │                 │     │ dumb-init       │
│                 │     │                 │     │ HEALTHCHECK     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Docker Compose Stack

```
┌──────────────────────────────────────────────────────────────────────┐
│                      docker-compose Services                          │
│                                                                       │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                │
│  │ agent-eval- │   │    otel-    │   │    jaeger   │                │
│  │   harness   │┌─▶│  collector  │──▶│ (UI :16686)│                │
│  │  (app:3000) ││  │ (4317/4318) │   └─────────────┘                │
│  └─────────────┘│  └─────────────┘                                    │
│                 │          │                                          │
│                 │          ▼                                          │
│                 │  ┌─────────────┐   ┌─────────────┐                │
│                 │  │ prometheus  │   │   grafana   │                │
│                 │  │ (:9090)     │──▶│ (:3001)     │                │
│                 │  └─────────────┘   └─────────────┘                │
│                 │                                                    │
│                 │  ┌─────────────┐                                    │
│                 └─▶│  mock-llm   │  (TODO: not yet implemented)     │
│                    │             │                                    │
│                    └─────────────┘                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Package Exports

The library exports 10 entry points via `package.json` `exports`:

| Export Path | Source | Purpose |
|-------------|--------|---------|
| `.` | `dist/index.js` | Main barrel (all public API) |
| `./types` | `dist/types/index.js` | Domain types and Zod schemas |
| `./trajectory` | `dist/trajectory/index.js` | Loader, evaluator, comparator |
| `./tool-use` | `dist/tool-use/index.js` | Validator, schema checker, result verifier |
| `./cost` | `dist/cost/index.js` | Tracker, budget manager, reporter |
| `./latency` | `dist/latency/index.js` | Monitor, budget enforcer, optimizer |
| `./judge` | `dist/judge/index.js` | Engine, calibration, prompts |
| `./golden` | `dist/golden/index.js` | Manager, comparator, curator |
| `./suite` | `dist/suite/index.js` | Runner, config, results, comparator |
| `./gate` | `dist/gate/index.js` | Engine, threshold gates, CI integration |
| `./mcp-server` | `dist/mcp-server/index.js` | MCP server factory |
| `./observability` | `dist/observability/index.js` | Tracing, metrics, logger, dashboard |

---

## Dependencies

### Production Dependencies (17 packages)

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk ^0.24.0` | Claude LLM provider |
| `@google/generative-ai ^0.21.0` | Gemini LLM provider |
| `@modelcontextprotocol/sdk ^1.0.0` | MCP protocol implementation |
| `@opentelemetry/*` (7 packages) | Tracing, metrics, exporters |
| `ajv ^8.16.0` | JSON Schema validation |
| `chalk ^5.3.0` | Colored terminal output |
| `cli-progress ^3.12.0` | CLI progress bars |
| `commander ^14.0.3` | CLI framework |
| `json-schema ^0.4.0` | Schema type definitions |
| `openai ^4.52.0` | OpenAI/GPT-4 LLM provider |
| `pino ^9.2.0` | Structured JSON logging |
| `pino-pretty ^13.1.3` | Pretty-print log output |
| `tiktoken ^1.0.15` | Accurate token counting |
| `yaml ^2.4.5` | YAML config parsing |
| `zod ^3.23.8` | Runtime schema validation |

### Dev Dependencies (6 packages)

| Package | Purpose |
|---------|---------|
| `@biomejs/biome ^1.9.4` | Linting and formatting |
| `@types/*` (2 packages) | TypeScript type definitions |
| `@vitest/coverage-v8 ^3.2.4` | Test coverage |
| `husky ^9.0.11` | Git hooks |
| `lint-staged ^15.2.7` | Pre-commit checks |
| `typescript ^5.8.3` | TypeScript compiler |
| `vitest ^3.2.4` | Test framework |

---

## Skills Directory

Ten specialized skill documents in `skills/` provide domain-specific guidance:

| Skill | File | Lines | Focus |
|-------|------|-------|-------|
| Trajectory Evaluation | `skills/trajectory-eval/skill.md` | ~180 | Multi-turn quality, coherence, goal completion |
| Tool-Use Validation | `skills/tool-use-validation/skill.md` | ~190 | Tool selection, schema compliance, argument validation |
| Cost Tracking | `skills/cost-tracking/skill.md` | ~180 | Per-task costs, budget alerts, optimization |
| Latency Budgets | `skills/latency-budgets/skill.md` | ~180 | P50/P90/P99 monitoring, SLA enforcement |
| LLM Judge | `skills/llm-judge-calibrated/skill.md` | ~210 | Provider-agnostic judge, calibration, consensus |
| Golden Trajectories | `skills/golden-trajectories/skill.md` | ~200 | Reference trajectory creation, annotation, comparison |
| Regression Suites | `skills/regression-suites/skill.md` | ~190 | Suite orchestration, run comparison, significance |
| Faithfulness Scoring | `skills/faithfulness-scoring/skill.md` | ~180 | Hallucination detection, context adherence |
| Relevance Scoring | `skills/relevance-scoring/skill.md` | ~180 | Intent alignment, response utility |
| Eval Gating | `skills/eval-gating/skill.md` | ~190 | CI/CD quality gates, threshold/baseline/statistical gates |

Each skill follows a consistent format: What It Is, Why It Matters, How to Use It (CLI + programmatic), Key Metrics, Best Practices, Common Pitfalls, Related Skills.

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Trajectory load error | File not found, parse error | Return detailed error, suggest fixes |
| Invalid trajectory format | Missing required fields (Zod validation) | List missing fields, show expected schema |
| LLM API error | Non-2xx response | Retry with exponential backoff (3 retries), skip sample, continue |
| Budget exceeded | Cost > budget limit | Stop judge, return partial results |
| Gate evaluation error | Invalid gate config | Log error, fail open (pass) with warning |
| Timeout | Request exceeds timeout (default 60s per trajectory) | Return partial results, log warning |
| MCP transport disconnect | Client disconnects stdin/stdout | Server exits gracefully (SIGTERM handler) |
| Empty trajectory directory | No JSONL files found | Return error with path, suggest glob pattern |

---

## References

- **AGENTS.md** — Agent development guide (public API, CLI, MCP tools, testing)
- **README.md** — Quick start and overview
- **DEV_PLAN.md** — 18-phase development checklist (all phases complete)
- **CLAUDE.md** — Developer reference (adding metrics, judge prompts, MCP tools)
- **WALKTHROUGH.md** — Step-by-step walkthrough
- **CHANGELOG.md** — Version history
- **trajectories/examples/** — Example trajectories (`sample.jsonl`, `golden.jsonl`) and `config.yaml`
- **skills/** — 10 domain-specific skill documents
- **MCP Specification** — https://modelcontextprotocol.io/
- **GitHub Repository** — https://github.com/reaatech/agent-eval-harness
