# @reaatech/agent-eval-harness-mcp-server

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-mcp-server.svg)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Three-layer MCP (Model Context Protocol) server exposing evaluation tools. Provides 13 tools across three layers — atomic judge operations, orchestrated suite runs, and CI gate operations — all accessible via MCP stdio transport for integration with AI coding agents like Claude Desktop.

## Installation

```bash
npm install @reaatech/agent-eval-harness-mcp-server
```

## Feature Overview

- **13 MCP tools** — covering the full evaluation lifecycle from atomic judgment to CI gate checking
- **Three-layer architecture** — `eval.judge.*` (5 fast, stateless atomic ops), `eval.suite.*` (5 orchestrated longer-running ops), `eval.gate.*` (3 blocking CI gate ops)
- **Stdio transport** — standard MCP protocol over stdin/stdout, no HTTP server required
- **Auto-discovery** — agents can list available tools and their input/output schemas at connection
- **In-memory state** — session-scoped run storage with no external database dependency
- **JSON Schema tool definitions** — each tool declares its input shape for type-safe agent invocation

## Quick Start

```typescript
import { createMCPServer } from '@reaatech/agent-eval-harness-mcp-server';

const server = await createMCPServer();
await server.start(); // Connects via stdio — ready for MCP clients
```

Configure tool layers individually:

```typescript
import { createMCPServer } from '@reaatech/agent-eval-harness-mcp-server';

const server = await createMCPServer({
  name: 'my-eval-server',
  enableJudgeTools: true,
  enableSuiteTools: true,
  enableGateTools: false, // gate ops disabled
});
```

## API Reference

### Server

| Export | Type | Description |
|--------|------|-------------|
| `EvalHarnessMCPServer` | Class | MCP server instance wrapping `@modelcontextprotocol/sdk` |
| `createMCPServer(config?)` | `async (config?: Partial<MCPServerConfig>) => Promise<EvalHarnessMCPServer>` | Create and start server in one call |

**EvalHarnessMCPServer methods:**

| Method | Description |
|--------|-------------|
| `run()` | Connect and start listening on stdio transport |
| `getServer()` | Access underlying MCP `Server` instance |
| `close()` | Gracefully close the server connection |

### Configuration

**MCPServerConfig**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | `'agent-eval-harness'` | Server name reported to MCP clients |
| `version` | `string` | `package.version` | Server version |
| `enableJudgeTools` | `boolean` | `true` | Register `eval.judge.*` tools |
| `enableSuiteTools` | `boolean` | `true` | Register `eval.suite.*` tools |
| `enableGateTools` | `boolean` | `true` | Register `eval.gate.*` tools |

### Tool Reference

#### Layer 1 — eval.judge.* (Atomic Operations)

Fast, stateless operations designed for mid-task self-evaluation by agents.

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `eval.judge.faithfulness` | `{ context: string, response: string }` | `{ score, explanation, confidence }` | Score response faithfulness to context |
| `eval.judge.relevance` | `{ intent: string, response: string }` | `{ score, explanation, confidence }` | Score response relevance to intent |
| `eval.judge.tool_correctness` | `{ expected_tool: string, actual_tool: string, arguments?: object, result?: object }` | `{ score, explanation, confidence }` | Validate tool selection and arguments |
| `eval.judge.cost_check` | `{ trajectory: object, budget: number }` | `{ within_budget, cost, budget, usage_percentage }` | Verify cost within budget |
| `eval.judge.latency_check` | `{ trajectory: object, sla: number }` | `{ within_sla, p99_ms, p50_ms, p90_ms, total_ms }` | Verify latency within SLA |

#### Layer 2 — eval.suite.* (Orchestrated Runs)

Stateful operations for eval-driven development. In-memory storage per session.

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `eval.suite.run` | `{ trajectories: object[], config?: { metrics?, judge_model?, budget_limit? } }` | `{ run_id, status, total_trajectories, completed, failed, duration_ms }` | Execute evaluation suite |
| `eval.suite.status` | `{ run_id: string }` | `{ run_id, status, progress, completed, total, started_at, ended_at }` | Get run progress |
| `eval.suite.results` | `{ run_id: string, format?: 'json' \| 'summary' }` | Aggregated results or summary | Retrieve evaluation results |
| `eval.suite.compare` | `{ baseline_run: string, candidate_run: string }` | `{ score_diff, verdict, regressions, improvements, key_findings }` | Compare two runs |
| `eval.suite.baseline` | `{ run_id: string, name?: string }` | `{ baseline_id, name, set_at }` | Set baseline for regression |

#### Layer 3 — eval.gate.* (CI Gates)

Blocking, opinionated operations for CI/CD pipelines. In-memory gate storage per session.

| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `eval.gate.run` | `{ run_id?: string, gate_config?: string, results?: object, comparison?: object }` | `{ passed, total_gates, passed_gates, failed_gates, results, exit_code }` | Run CI-style pass/fail gate |
| `eval.gate.config` | `{ action: 'get' \| 'set' \| 'list', config?: object[], preset?: 'standard' \| 'strict' \| 'lenient' }` | `{ gates }` or `{ success, gates_loaded }` | Get/set/list gate configuration |
| `eval.gate.diff` | `{ baseline: object, candidate: object, metrics?: string[] }` | `{ score_diff, metric_diffs, regressions, improvements, verdict }` | Detailed diff from baseline |

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
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | CLI |
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | Observability |

## License

MIT
