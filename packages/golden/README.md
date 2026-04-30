# @reaatech/agent-eval-harness-golden

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-golden)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-golden)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/reaatech/agent-eval-harness/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml)](https://github.com/reaatech/agent-eval-harness/actions)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Golden trajectory management for agent evaluation regression testing. Create, annotate, validate, and curate reference trajectories, then compare candidate agent runs against them with detailed diff analysis and regression detection.

## Installation

```bash
npm install @reaatech/agent-eval-harness-golden
```

## Feature Overview

- **Golden trajectory CRUD** — load, create, update, and filter reference trajectories by tags and scenarios
- **Annotation workflow** — mark expected turns, add quality notes, tag golden trajectories for organization
- **Curation pipeline** — structured workflow: identify → annotate → validate → publish with batch quality checks
- **Comparison engine** — diff candidate trajectories against goldens with turn-level similarity scoring
- **Regression detection** — identify missing turns, tool mismatches, and low-similarity responses
- **Batch comparison** — compare multiple candidates against a library of golden references

## Quick Start

```typescript
import { createGolden, compareAgainstGolden, quickCreateGolden } from '@reaatech/agent-eval-harness-golden';
import type { Trajectory } from '@reaatech/agent-eval-harness-types';

// Quick creation for simple scenarios
const golden = quickCreateGolden(trajectory, 'password-reset', ['auth', 'critical']);

// Compare a new run against the golden
const result = compareAgainstGolden(golden, candidateTrajectory, { similarityThreshold: 0.85 });
console.log(`Similarity: ${result.similarity}, Regressions: ${result.regressions.length}`);
```

## API Reference

### Golden Manager

| Name | Type | Description |
|------|------|-------------|
| `loadGoldenTrajectories(jsonlContent)` | `function` | Parse JSONL string into an array of `GoldenTrajectory` objects |
| `validateGolden(golden)` | `function` | Validate a golden trajectory structure; returns `{ valid, errors, warnings, score }` |
| `goldenToJSONL(golden)` | `function` | Serialize a golden trajectory back to JSONL string format |
| `createGolden(trajectory, options)` | `function` | Create a new golden trajectory from a candidate trajectory with metadata options |
| `updateGolden(golden, changes)` | `function` | Update a golden trajectory's metadata and bump the `updatedAt` timestamp |
| `filterByTags(goldens, tags)` | `function` | Filter golden trajectories by tag intersection |
| `getByScenario(goldens, scenario)` | `function` | Search golden trajectories by scenario name (description or trajectory ID match) |

### Comparison Engine

| Name | Type | Description |
|------|------|-------------|
| `compareAgainstGolden(golden, candidate, config?)` | `function` | Compare a candidate trajectory against a golden; returns `TrajectoryComparisonResult` |
| `batchCompare(golden, candidates, config?)` | `function` | Compare multiple candidates against a single golden in one call |
| `findBestGolden(candidate, goldens, config?)` | `function` | Find the best-matching golden for a candidate across a golden library |

### Curation

| Name | Type | Description |
|------|------|-------------|
| `GoldenCurator` | `class` | Structured curation workflow with `start()`, `annotateTurn()`, `autoAnnotate()`, `runQualityChecks()`, `validate()`, `publish()`, `exportJSONL()` |
| `createCurator(trajectory)` | `function` | Factory: returns a new `GoldenCurator` instance |
| `quickCreateGolden(trajectory, description, tags)` | `function` | One-shot: auto-annotate, validate, and publish a golden in a single call |
| `batchQualityCheck(goldens)` | `function` | Run quality checks across a library of goldens; returns per-golden results |
| `generateCurationReport(goldens)` | `function` | Generate a human-readable curation report with issues and suggestions |

### Types

| Name | Type | Description |
|------|------|-------------|
| `GoldenTrajectory` | `interface` | Golden reference with `id`, `metadata` (version, tags, description, quality notes), and `trajectory` |
| `GoldenMetadata` | `interface` | Version, timestamps, description, tags, quality notes, expected outcomes |
| `GoldenValidationResult` | `interface` | Result of `validateGolden` with `valid`, `errors`, `warnings`, `score` |
| `TrajectoryComparisonResult` | `interface` | Comparison output: `similarity`, `turnComparisons`, `matchingTurns`, `divergentTurns`, `passesThreshold`, `regressions`, `diffSummary` |
| `TurnComparison` | `interface` | Per-turn diff: `turnId`, `similarity`, `contentMatch`, `toolMatch`, `differences` |
| `Regression` | `interface` | Detected regression with `type` (tool_mismatch / content_divergence / missing_turn / extra_turn), `severity`, `turnId`, `description` |
| `ComparisonConfig` | `interface` | Comparison options: `similarityThreshold`, `compareTools`, `semanticComparison`, `turnMatching` |
| `CurationState` | `interface` | Curation workflow step and accumulated annotations |
| `TurnAnnotation` | `interface` | Per-turn annotation: `turnId`, `expected`, `qualityNotes`, `alternatives` |
| `QualityCheckResult` | `interface` | Curation quality check output: `passed`, `score`, `issues`, `suggestions` |

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
