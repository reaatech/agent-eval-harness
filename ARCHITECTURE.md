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
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
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
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │       run       │    │     config      │    │       diff      │  │
│  │                 │    │                 │    │                 │  │
│  │ Run CI-style    │    │ Get/set gate    │    │ Get detailed    │  │
│  │ pass/fail gate  │    │ configuration   │    │ diff from base  │  │
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
│  │ - Component     │    │ - Optimization  │    │ - Export        │  │
│  │   breakdown     │    │   recommend     │    │                 │  │
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
│  │ - Provider-     │    │ - Human label   │    │ - Faithfulness  │  │
│  │   agnostic      │    │   alignment     │    │ - Relevance     │  │
│  │ - Batch         │    │ - Temperature   │    │ - Tool          │  │
│  │   processing    │    │   scaling       │    │   correctness   │  │
│  │ - Parallel      │    │ - Multi-judge   │    │ - Overall       │  │
│  │   requests      │    │   consensus     │    │   quality       │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
│  Output: JudgeScore { score, explanation, confidence, calibrated }  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Complete Evaluation Flow

```
1. Load trajectory (JSONL format)
        │
2. Validate trajectory structure:
   - Required fields present
   - Valid turn sequence
   - Tool calls properly formatted
        │
3. Evaluate trajectory quality:
   - Multi-turn coherence
   - Goal completion verification
   - Conversation flow analysis
        │
4. Validate tool-use:
   - Correct tool selection
   - Argument schema validation
   - Result verification
        │
5. Calculate costs:
   - Per-turn token counting
   - Provider-specific pricing
   - Budget compliance check
        │
6. Check latency:
   - Per-turn latency measurement
   - SLA threshold verification
   - Bottleneck identification
        │
7. Run LLM judge (if configured):
   - Faithfulness scoring
   - Relevance scoring
   - Overall quality assessment
        │
8. Compare against golden (if available):
   - Similarity calculation
   - Diff generation
   - Regression detection
        │
9. Aggregate results:
   - Overall score calculation
   - Per-metric breakdown
   - Summary statistics
        │
10. Evaluate gates (if configured):
    - Threshold checks
    - Baseline comparison
    - Pass/fail determination
        │
11. Export results:
    - JSON report
    - CI-compatible output
    - Observability data
```

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Data                                                        │
│ - PII redaction in all logs                                         │
│ - Hash sensitive identifiers                                        │
│ - Never log raw trajectory content                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: API Keys                                                    │
│ - All LLM API keys from environment variables                       │
│ - Never log API keys or tokens                                      │
│ - Separate keys per provider                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Cost Controls                                               │
│ - Budget limits enforced                                            │
│ - Cost estimation before expensive operations                       │
│ - Real-time cost monitoring with alerts                             │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Export Security                                             │
│ - PII sanitization before export                                    │
│ - Configurable data retention                                       │
│ - Secure transport (HTTPS) for remote exporters                     │
└─────────────────────────────────────────────────────────────────────┘
```

### PII Handling

- Trajectory content is never logged (only hashed identifiers)
- User identifiers are hashed before logging
- Exports are sanitized to remove PII
- Configurable PII patterns for redaction

---

## Observability

### Tracing

Every evaluation run generates OpenTelemetry spans:

| Span | Attributes |
|------|------------|
| `eval.run` | trajectories, config, metrics |
| `trajectory.load` | format, path, turns |
| `judge.evaluate` | model, samples, cost |
| `gate.check` | gate_count, passed |

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agent_eval.runs.total` | Counter | `status` | Total evaluation runs |
| `agent_eval.trajectories.evaluated` | Counter | `dataset` | Trajectories processed |
| `agent_eval.judge.calls` | Counter | `model`, `status` | LLM judge API calls |
| `agent_eval.judge.cost` | Histogram | `model` | Judge cost per run |
| `agent_eval.gates.result` | Gauge | `gate_name` | Gate pass/fail (1/0) |
| `agent_eval.cost.per_task` | Histogram | `task_type` | Cost per task |
| `agent_eval.latency.p99` | Gauge | `component` | P99 latency |

### Logging

All logs are structured JSON with standard fields:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "agent-eval-harness",
  "eval_run_id": "eval-123",
  "level": "info",
  "message": "Evaluation completed",
  "trajectories": 50,
  "overall_score": 0.87,
  "judge_cost": 12.34,
  "gates_passed": true,
  "duration_ms": 45000
}
```

---

## Deployment Architecture

### GCP Cloud Run

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
│  - Memory: 1GB, CPU: 1 vCPU                                         │
│  - Timeout: 300s (for large evals)                                  │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
│  Storage: GCS for trajectories and results                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Trajectory load error | File not found, parse error | Return detailed error, suggest fixes |
| Invalid trajectory format | Missing required fields | List missing fields, show expected schema |
| LLM API error | Non-2xx response | Retry with backoff, skip sample, continue |
| Budget exceeded | Cost > budget limit | Stop judge, return partial results |
| Gate evaluation error | Invalid gate config | Log error, fail open (pass) with warning |
| Timeout | Request exceeds timeout | Return partial results, log warning |

---

## References

- **AGENTS.md** — Agent development guide
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **trajectories/examples/** — Example trajectories and configurations
- **MCP Specification** — https://modelcontextprotocol.io/
- **agent-mesh/AGENTS.md** — Multi-agent orchestration patterns
- **classifier-evals/ARCHITECTURE.md** — Classifier evaluation patterns
