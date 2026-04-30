# @reaatech/agent-eval-harness-cli

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-cli.svg)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Command-line interface for the agent-eval-harness ecosystem. Provides 7 subcommands for full evaluation runs, on-the-fly LLM judging, baseline comparison, CI gate checking, golden trajectory management, multi-format reporting, and an MCP server in stdio mode.

## Installation

```bash
npm install @reaatech/agent-eval-harness-cli
# or
npm install -g @reaatech/agent-eval-harness-cli
```

## Feature Overview

- **7 subcommands** — `eval`, `judge`, `compare`, `gate`, `golden`, `report`, `serve`
- **Full evaluation pipeline** — load trajectories from files or directories, run multi-metric evaluation, output results as JSON or CSV
- **On-the-fly judging** — evaluate faithfulness, relevance, tool correctness, or overall quality with a single command
- **CI gate checking** — evaluate gate presets (standard, strict, lenient) against results with exit codes for pipeline integration
- **Golden trajectory management** — list, create, update, and validate golden reference trajectories
- **Multi-format reporting** — JSON, HTML, Markdown, and PDF output for evaluation results
- **MCP server** — stdio-mode MCP server exposing all 13 eval tools to AI coding agents

## Quick Start

```bash
# Install globally
npm install -g @reaatech/agent-eval-harness-cli

# Run evaluation on a directory of JSONL trajectories
agent-eval-harness eval trajectories/ --config eval-config.yaml --output results/

# Judge a single response on faithfulness
agent-eval-harness judge faithfulness \
  --context "The user's account is associated with email john@example.com" \
  --response "I've sent the password reset to john@example.com"

# Compare two evaluation runs
agent-eval-harness compare results/baseline.json results/candidate.json --format markdown

# Check CI regression gates
agent-eval-harness gate results/results.json --preset standard --exit-code

# List golden trajectories
agent-eval-harness golden --list

# Generate HTML report
agent-eval-harness report results/results.json --format html --output report.html

# Start MCP server
agent-eval-harness serve
```

## API Reference

### Binary Entry

```
agent-eval-harness [global-options] <command> [command-options]
```

### Global Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-v, --verbose` | `boolean` | `false` | Enable verbose output |
| `-c, --config <path>` | `string` | `eval-config.yaml` | Path to configuration file |
| `-o, --output <path>` | `string` | `results` | Output directory for results |

### Subcommand: `eval <paths...>`

Run full evaluation on trajectory files or directories.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-g, --golden <path>` | `string` | — | Path to golden trajectory for comparison |
| `-m, --metrics <metrics>` | `string` | — | Comma-separated list of metrics to evaluate |
| `--judge-model <model>` | `string` | `claude-opus` | Model to use for LLM judge |
| `--no-judge` | `boolean` | `false` | Disable LLM judge evaluation |
| `--budget <budget>` | `string` | `10.00` | Cost budget limit (USD) |
| `-f, --format <format>` | `string` | `json` | Output format (`json`, `junit`, `csv`) |

### Subcommand: `judge <aspect>`

Run LLM judge on a specific evaluation aspect.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-t, --trajectory <path>` | `string` | — | Path to trajectory file |
| `--context <text>` | `string` | — | Context for faithfulness evaluation |
| `--response <text>` | `string` | — | Response to evaluate |
| `--intent <text>` | `string` | — | User intent for relevance evaluation |
| `--model <model>` | `string` | `claude-opus` | Model to use for judging |
| `--calibrated` | `boolean` | `false` | Use calibrated scores |

Valid aspects: `faithfulness`, `relevance`, `tool_correctness`, `overall`

### Subcommand: `compare <baseline> <candidate>`

Compare two evaluation runs.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--statistical` | `boolean` | `false` | Run statistical significance tests |
| `-f, --format <format>` | `string` | `json` | Output format (`json`, `markdown`, `table`) |

### Subcommand: `gate <results>`

Check regression gates against evaluation results.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--gates <path>` | `string` | `gates.yaml` | Path to gate configuration file |
| `--preset <preset>` | `string` | `standard` | Gate preset (`standard`, `strict`, `lenient`) |
| `--exit-code` | `boolean` | `true` | Return CI-compatible exit code |

### Subcommand: `golden`

Manage golden reference trajectories.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-l, --list` | `boolean` | `false` | List all golden trajectories |
| `-c, --create <path>` | `string` | — | Create new golden trajectory from file |
| `-u, --update <id>` | `string` | — | Update existing golden trajectory |
| `-d, --delete <id>` | `string` | — | Delete golden trajectory |
| `--validate <path>` | `string` | — | Validate golden trajectory quality |
| `--dir <path>` | `string` | `golden` | Golden trajectories directory |

### Subcommand: `report <results>`

Generate evaluation reports.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-f, --format <format>` | `string` | `markdown` | Output format (`html`, `markdown`, `json`, `pdf`) |
| `-o, --output <path>` | `string` | — | Output file path |
| `--template <path>` | `string` | — | Custom report template |
| `--include-raw` | `boolean` | `false` | Include raw trajectory data in report |

### Subcommand: `serve`

Start the MCP server.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-p, --port <port>` | `string` | `3000` | Server port |
| `--host <host>` | `string` | `localhost` | Server host |
| `--transport <transport>` | `string` | `http` | Transport type (`http`, `stdio`) |

### Programmatic Use

Command functions and output helpers are available as library exports:

```typescript
import {
  evalCommand,
  judgeCommand,
  compareCommand,
  gateCommand,
  goldenCommand,
  reportCommand,
  cliOut,
  cliError,
  cliWarn,
} from "@reaatech/agent-eval-harness-cli";
```

### Type Exports

| Type | Description |
|------|-------------|
| `EvalOptions` | Options interface for `evalCommand` |
| `JudgeOptions` | Options interface for `judgeCommand` |
| `CompareOptions` | Options interface for `compareCommand` |
| `GateOptions` | Options interface for `gateCommand` |
| `GoldenOptions` | Options interface for `goldenCommand` |
| `ReportOptions` | Options interface for `reportCommand` |

## Usage Patterns

### Using in Docker

```bash
# Build the image
docker build -t agent-eval-harness .

# Run evaluation with mounted volumes
docker run -v ./trajectories:/app/trajectories \
  -v ./results:/app/results \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  agent-eval-harness eval trajectories/ --output results/

# Start MCP server in stdio mode
docker run -i agent-eval-harness serve
```

### CI Pipeline Integration

Use the `gate` subcommand in CI workflows to block regressions:

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
          npx @reaatech/agent-eval-harness-cli eval trajectories/ \
            --config eval-config.yaml \
            --output results/

      - name: Run regression gates
        run: |
          npx @reaatech/agent-eval-harness-cli gate results/results.json \
            --preset standard \
            --exit-code

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: results/
```

The `--exit-code` flag causes the command to exit with code 1 when any gate fails, failing the CI step.

Gate presets provide ready-made thresholds:

| Preset | Overall Quality | Cost Limit | Latency P99 | Tool Correctness | Faithfulness |
|--------|----------------|------------|-------------|------------------|-------------|
| `standard` | >= 0.80 | <= $0.05 | <= 5000ms | >= 0.90 | >= 0.80 |
| `strict` | >= 0.90 | <= $0.02 | <= 2000ms | >= 0.95 | >= 0.90 |
| `lenient` | >= 0.60 | <= $0.10 | <= 10000ms | >= 0.70 | >= 0.60 |

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
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | Observability |

## License

[MIT](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
