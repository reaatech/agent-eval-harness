# agent-eval-harness

[![CI](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> **Production-ready TypeScript evaluation harness for AI agent trajectories.** Multi-turn conversation analysis, tool-call validation, cost tracking, latency budgets, LLM-as-judge scoring, golden trajectory comparison, CI/CD regression gates, and a three-layer MCP tool server — all in a pnpm monorepo of composable packages.

This monorepo provides 12 independent packages for building, running, and integrating agent evaluation pipelines. Every package is dual ESM/CJS, published under the `@reaatech` scope, and versioned independently via Changesets.

## Features

- **Trajectory evaluation** — Heuristic multi-turn quality assessment with coherence, goal completion, and conversation flow scoring
- **Tool-use validation** — 13+ issue types for tool selection, schema compliance, and hallucination detection
- **Cost tracking** — Per-turn and per-trajectory costing for 8 LLM models with budget enforcement and alerting
- **Latency monitoring** — P50/P90/P99 percentile analysis, SLA enforcement, and optimization recommendations
- **LLM-as-judge** — Provider-agnostic quality scoring (Claude, GPT-4, Gemini, OpenRouter) with calibration and multi-model consensus
- **Golden trajectories** — Reference trajectory creation, annotation, comparison, and curation workflow
- **Suite runner** — Batch evaluation orchestration with concurrency, YAML config, multi-format result export, and run comparison
- **CI/CD gates** — Threshold, baseline, and regression gates with JUnit XML output, GitHub Annotations, and PR comments
- **MCP server** — 13 tools across three layers (judge, suite, gate) over stdio transport for AI coding agent integration
- **Observability** — OpenTelemetry tracing, 7 pre-configured metrics, structured logging with PII redaction, in-memory dashboards

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core types and Zod schemas
pnpm add @reaatech/agent-eval-harness-types

# Trajectory loading and evaluation
pnpm add @reaatech/agent-eval-harness-trajectory

# Tool-use validation
pnpm add @reaatech/agent-eval-harness-tool-use

# Cost tracking and budgets
pnpm add @reaatech/agent-eval-harness-cost

# Latency monitoring and SLA enforcement
pnpm add @reaatech/agent-eval-harness-latency

# LLM-as-judge with calibration
pnpm add @reaatech/agent-eval-harness-judge

# Golden trajectory management
pnpm add @reaatech/agent-eval-harness-golden

# Suite runner and results aggregation
pnpm add @reaatech/agent-eval-harness-suite

# CI regression gates
pnpm add @reaatech/agent-eval-harness-gate

# MCP tool server
pnpm add @reaatech/agent-eval-harness-mcp-server

# CLI with 7 subcommands
pnpm add @reaatech/agent-eval-harness-cli

# Observability (tracing, metrics, logging)
pnpm add @reaatech/agent-eval-harness-observability
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/agent-eval-harness.git
cd agent-eval-harness

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Run linting
pnpm lint
```

## Quick Start

Load a trajectory from JSONL, evaluate it, and run a CI gate:

```typescript
import { loadFromContent, evaluate } from '@reaatech/agent-eval-harness-trajectory';
import { validateTrajectory, createToolSchema } from '@reaatech/agent-eval-harness-tool-use';
import { calculateTrajectoryCost } from '@reaatech/agent-eval-harness-cost';

const jsonl = [
  '{"turn_id":1,"role":"user","content":"Reset my password","timestamp":"2026-04-15T23:00:00Z"}',
  '{"turn_id":2,"role":"agent","content":"Password reset sent!","tool_calls":[{"name":"send_reset_email","arguments":{"to":"user@example.com"},"result":{"status":"sent"}}],"timestamp":"2026-04-15T23:00:01Z","latency_ms":800,"cost":{"input_tokens":120,"output_tokens":32}}',
].join('\n');

// Load and evaluate
const trajectory = loadFromContent(jsonl);
const evalResult = evaluate(trajectory);
console.log(`Score: ${evalResult.overall_score}, Passed: ${evalResult.passed}`);

// Validate tool calls
const sendEmailSchema = createToolSchema('send_reset_email', {
  properties: { to: { type: 'string' } },
  required: ['to'],
});
const toolResults = validateTrajectory(trajectory, { send_reset_email: sendEmailSchema });
console.log(`Tool valid: ${toolResults[0]?.valid}, Score: ${toolResults[0]?.score}`);

// Track costs
const cost = calculateTrajectoryCost(trajectory, 'claude-opus');
console.log(`Cost: $${cost.total_cost.toFixed(4)}`);
```

## Packages

| Package | Description |
| ------- | ----------- |
| [`@reaatech/agent-eval-harness-types`](./packages/types) | Shared domain types and Zod schemas |
| [`@reaatech/agent-eval-harness-trajectory`](./packages/trajectory) | Trajectory loading, multi-turn evaluation, and golden comparison |
| [`@reaatech/agent-eval-harness-tool-use`](./packages/tool-use) | Tool-call validation, schema compliance, and result verification |
| [`@reaatech/agent-eval-harness-cost`](./packages/cost) | Cost tracking, budget management, and reporting |
| [`@reaatech/agent-eval-harness-latency`](./packages/latency) | Latency monitoring, SLA enforcement, and optimization |
| [`@reaatech/agent-eval-harness-judge`](./packages/judge) | Provider-agnostic LLM-as-judge with calibration and consensus |
| [`@reaatech/agent-eval-harness-golden`](./packages/golden) | Golden trajectory creation, comparison, and curation |
| [`@reaatech/agent-eval-harness-suite`](./packages/suite) | Orchestrated suite runner with results aggregation |
| [`@reaatech/agent-eval-harness-gate`](./packages/gate) | CI regression gates with JUnit/GitHub integration |
| [`@reaatech/agent-eval-harness-mcp-server`](./packages/mcp-server) | Three-layer MCP tool server |
| [`@reaatech/agent-eval-harness-cli`](./packages/cli) | CLI with 7 subcommands for eval, judge, gate, and more |
| [`@reaatech/agent-eval-harness-observability`](./packages/observability) | OpenTelemetry tracing, metrics, and structured logging |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, package relationships, and data flows
- [`AGENTS.md`](./AGENTS.md) — Coding conventions and development guidelines
- [`GITHUB_TO_NPM.md`](./GITHUB_TO_NPM.md) — npm and GitHub Packages publishing runbook
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution workflow and release process
- [`skills/`](./skills/) — 10 domain-specific skill documents for each evaluation domain

### Trajectory Format

Trajectories are JSONL files — one JSON object per turn, separated by newlines:

```jsonl
{"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z"}
{"turn_id": 1, "role": "agent", "content": "I can help.", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z", "latency_ms": 1200}
{"turn_id": 2, "role": "user", "content": "john@example.com", "timestamp": "2026-04-15T23:00:05Z"}
{"turn_id": 2, "role": "agent", "content": "Password reset sent!", "tool_calls": [{"name":"send_reset_email","arguments":{"email":"john@example.com"},"result":{"status":"sent"}}], "timestamp": "2026-04-15T23:00:06Z", "latency_ms": 800, "cost": {"input_tokens": 150, "output_tokens": 45}}
```

See [`trajectories/examples/`](./trajectories/examples/) for complete sample files.

### Three-Layer MCP Tool Architecture

The `@reaatech/agent-eval-harness-mcp-server` package exposes 13 tools across three layers:

| Layer | Prefix | Use Case | Count |
|-------|--------|----------|-------|
| **Judge** | `eval.judge.*` | Fast, stateless atomic operations for mid-task self-evaluation | 5 tools |
| **Suite** | `eval.suite.*` | Orchestrated longer-running evaluation runs with results aggregation | 5 tools |
| **Gate** | `eval.gate.*` | Blocking CI gate operations for regression prevention | 3 tools |

```bash
# Start the MCP server for Claude Desktop or other MCP clients
pnpm add @reaatech/agent-eval-harness-cli
agent-eval-harness serve
```

## License

[MIT](LICENSE)
