# CLAUDE.md — Development Guide

## Project Structure

```
src/
├── index.ts              # Library entry point
├── cli.ts                # CLI entry point
├── types/                # Core domain types
├── trajectory/           # Trajectory loading and evaluation
├── tool-use/             # Tool-use correctness validation
├── cost/                 # Cost-per-task tracking
├── latency/              # Latency budget enforcement
├── judge/                # LLM-as-judge with calibration
├── suite/                # Evaluation suite orchestration
├── gate/                 # CI regression gates
├── golden/               # Golden trajectory management
├── mcp-server/           # MCP server (eval.judge.*, eval.suite.*, eval.gate.*)
├── observability/        # OTel, logging
└── utils/                # Shared utilities

tests/
├── unit/                 # Unit tests
├── integration/          # Integration tests
└── fixtures/             # Test fixtures

trajectories/
└── examples/             # Example golden trajectories (JSONL)
```

## Development Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Run tests
npm test               # All tests
npx vitest run tests/unit/        # Unit tests only
npx vitest run tests/integration/ # Integration tests
npm run test:coverage  # With coverage

# Start MCP server
npx agent-eval-harness serve
```

## Adding New Metrics

1. **Define the metric type** in `src/types/domain.ts`:

```typescript
export interface MetricResult {
  name: string;
  score: number;
  details: Record<string, unknown>;
}
```

2. **Implement the metric** in the appropriate module (e.g. `src/trajectory/`):

```typescript
export function evaluateMyMetric(trajectory: Trajectory): MetricResult {
  return {
    name: 'my_metric',
    score: 0.85,
    details: {},
  };
}
```

3. **Use in suite runner** via the evaluator callback:

```typescript
import { evaluateMyMetric } from '../trajectory/my-metric.js';

const result = await runner.run(trajectories, async (trajectory) => {
  const base = evaluate(trajectory);
  const myMetric = evaluateMyMetric(trajectory);
  return { ...base, metrics: { ...base.metrics, my_metric: myMetric.score } };
});
```

4. **Add gate threshold** in `src/gate/threshold-gates.ts`:

```typescript
export function getStandardPreset(): { gates: GateDefinition[] } {
  return {
    gates: [
      // ... existing gates
      {
        name: 'my-metric-threshold',
        type: 'threshold',
        metric: 'my_metric',
        operator: '>=',
        threshold: 0.7,
      },
    ],
  };
}
```

## Adding New Judge Prompts

1. **Add prompt template** in `src/judge/prompts.ts`:

```typescript
export function getMyCustomTemplate(): PromptTemplate {
  return {
    name: 'my_custom',
    system: `You are evaluating an AI agent's response.`,
    user: `Context: {context}
Response: {response}

Evaluate the response on a scale of 0-1 for:
- Criterion 1: ...
- Criterion 2: ...

Provide your score and explanation.`,
    responseFormat: `{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<brief explanation>",
  "confidence": <number between 0.0 and 1.0>
}`,
  };
}
```

2. **Use via `JudgeEngine.judge()`** in `src/judge/engine.ts`:

```typescript
const template = getMyCustomTemplate();
const { system, user } = buildPrompt(template, { context, response });
const result = await engine.judge({ type: 'overall_quality', context, response });
return result;
```

3. **Expose via MCP** in `src/mcp-server/tools/judge/index.ts`:

```typescript
{
  name: 'eval.judge.my_custom',
  description: 'Evaluate custom criterion',
  inputSchema: {
    type: 'object',
    properties: {
      context: { type: 'string' },
      response: { type: 'string' },
    },
  },
  handler: async (args) => {
    const result = await engine.judge({ type: 'overall_quality', context: args.context, response: args.response });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
}
```

## Testing Patterns

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { MyEvaluator } from '../src/my-evaluator.js';

describe('MyEvaluator', () => {
  it('should evaluate correctly', () => {
    const evaluator = new MyEvaluator();
    const result = evaluator.evaluate({ /* test data */ });
    expect(result.score).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { loadFromFile, evaluate } from '@reaatech/agent-eval-harness';

describe('Integration: Load and Evaluate', () => {
  it('should load and evaluate trajectory', () => {
    const trajectory = loadFromFile('tests/fixtures/sample.jsonl');
    const result = evaluate(trajectory);

    expect(result.overall_score).toBeGreaterThan(0);
    expect(result.metrics.coherence).toBeGreaterThan(0);
    expect(result.metrics.goal_completion).toBeGreaterThan(0);
  });
});
```

## Key Invariants

1. **Provider-agnostic** — Any LLM provider can be used for judging
2. **Reproducibility** — Same inputs always produce same outputs
3. **Cost transparency** — All judge costs tracked and reported
4. **CI compatibility** — Exit codes and reports suitable for automation
5. **No PII in logs** — Never log raw trajectory content
6. **Deterministic metrics** — Floating point comparisons with tolerance

## Debugging

### Enable verbose logging

```bash
DEBUG=agent-eval-harness:* npm run test
```

### View traces in Jaeger

```bash
docker-compose up -d jaeger
# Open http://localhost:16686
```

### View metrics in Prometheus

```bash
docker-compose up -d prometheus
# Open http://localhost:9090
```

## Common Issues

### Tests failing with import errors

Make sure you're using `.js` extensions in imports:
```typescript
import { foo } from './bar.js'; // ✅
import { foo } from './bar';    // ❌
```

### MCP server not starting

Check that port 3000 is available:
```bash
lsof -i :3000
```

### High judge costs

Use `--budget` flag to limit spending:
```bash
npx agent-eval-harness eval trajectories/*.jsonl --budget 5.00
