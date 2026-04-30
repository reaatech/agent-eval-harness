# @reaatech/agent-eval-harness-trajectory

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-trajectory)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-trajectory)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml)](https://github.com/reaatech/agent-eval-harness/actions)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Trajectory loading, multi-turn evaluation, and golden-comparison utilities for agent conversation analysis. Parses JSONL turn files, scores coherence and goal completion, and diffs candidate trajectories against golden references.

## Installation

```bash
npm install @reaatech/agent-eval-harness-trajectory
# or
pnpm add @reaatech/agent-eval-harness-trajectory
```

## Feature Overview

- **JSONL loader** — parse, validate, and serialize trajectory files with full Zod schema validation via `@reaatech/agent-eval-harness-types`
- **Multi-turn evaluation** — coherence analysis, goal completion scoring, and conversation flow metrics
- **Golden comparison** — diff candidate trajectories against reference with regression detection and improvement tracking
- **Directory batch load** — load and validate all `.jsonl` files in a directory in a single call
- **Custom error types** — `TrajectoryLoadError` with file path and cause tracking for precise debugging

## Quick Start

```typescript
import { loadFromContent, evaluate, compare } from '@reaatech/agent-eval-harness-trajectory';
import type { Trajectory } from '@reaatech/agent-eval-harness-types';

const jsonl =
  '{"turn_id":1,"role":"user","content":"Reset password","timestamp":"2026-04-15T00:00:00Z"}\n' +
  '{"turn_id":1,"role":"agent","content":"What\'s your email?","tool_calls":[],"timestamp":"2026-04-15T00:00:01Z"}';

const trajectory = loadFromContent(jsonl);
const result = evaluate(trajectory);
console.log(`Score: ${result.overall_score}, Coherence: ${result.metrics.coherence}`);
```

## API Reference

### Loader Functions

| Name | Type | Description |
|------|------|-------------|
| `parseTurn(line, lineNumber)` | `(string, number) => Turn` | Parse a single JSONL line into a validated `Turn` object |
| `loadFromContent(content, options?)` | `(string, LoadOptions?) => Trajectory` | Load a trajectory from a JSONL content string |
| `loadFromFile(filePath, options?)` | `(string, LoadOptions?) => Promise<Trajectory>` | Load a trajectory from a `.jsonl` file on disk |
| `loadFromDirectory(dirPath, options?)` | `(string, LoadOptions?) => Promise<Trajectory[]>` | Load all `.jsonl` files in a directory |
| `serializeToJsonl(trajectory)` | `(Trajectory) => string` | Serialize a trajectory to JSONL string format |
| `saveToFile(trajectory, filePath)` | `(Trajectory, string) => Promise<void>` | Save a trajectory to a `.jsonl` file |

### Loader Types

| Name | Type | Description |
|------|------|-------------|
| `LoadOptions` | `interface` | Options with `validate` (boolean, default `true`) and `generateId` (boolean, default `true`) |
| `TrajectoryLoadError` | `class extends Error` | Custom error with `cause`, `filePath`, and descriptive message |

### Evaluator Functions

| Name | Type | Description |
|------|------|-------------|
| `evaluate(trajectory, options?)` | `(Trajectory, EvaluateOptions?) => EvalResult` | Full trajectory evaluation returning overall score, per-metric scores, and issues |
| `analyzeCoherence(trajectory)` | `(Trajectory) => CoherenceResult` | Multi-turn coherence analysis with per-transition scoring |
| `analyzeGoalCompletion(trajectory)` | `(Trajectory) => GoalCompletionResult` | Determine if the agent completed the user's goal with confidence scoring |
| `analyzeConversationFlow(trajectory)` | `(Trajectory) => FlowAnalysis` | Conversation flow analysis with topic changes, interruptions, and flow score |

### Evaluator Types

| Name | Type | Description |
|------|------|-------------|
| `EvaluateOptions` | `interface` | Options with `checkCoherence`, `checkGoalCompletion`, `analyzeFlow`, and `coherenceThreshold` |
| `CoherenceResult` | `interface` | Coherence score, issues list, and per-transition analysis |
| `TurnTransition` | `interface` | Single turn transition with `from`, `to`, `coherent`, and optional `reason` |
| `GoalCompletionResult` | `interface` | Completion status, confidence, evidence array, and unresolved turn IDs |
| `FlowAnalysis` | `interface` | Flow metrics: avg turns per topic, topic changes, interruptions, and flow score |

### Comparator

| Name | Type | Description |
|------|------|-------------|
| `compare(candidate, golden, options?)` | `(Trajectory, GoldenTrajectory \| Trajectory, CompareOptions?) => ComparisonResult` | Compare a candidate trajectory against a golden reference |

### Comparator Types

| Name | Type | Description |
|------|------|-------------|
| `CompareOptions` | `interface` | Options with `similarityThreshold` (default 0.85), `compareTools`, `compareLatency`, `compareCosts`, and `strict` |
| `ComparisonResult` | `interface` | Overall similarity, pass/fail, diff, regressions, improvements, and per-turn comparisons |
| `TrajectoryDiff` | `interface` | Detailed diff with missing turns, extra turns, modified turns, and tool differences |
| `TurnDiff` | `interface` | Difference in a single turn field with expected and actual values |
| `ToolDiff` | `interface` | Tool call difference with expected/actual tool names and argument differences |
| `ArgumentDiff` | `interface` | Single argument difference with expected and actual values |
| `Regression` | `interface` | Regression record with type, severity, description, turn ID, and impact score |
| `Improvement` | `interface` | Improvement record with type, description, turn ID, and benefit score |
| `TurnComparison` | `interface` | Per-turn comparison with similarity, match status, and differences |

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
