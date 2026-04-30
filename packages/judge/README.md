# @reaatech/agent-eval-harness-judge

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-judge)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-judge)
[![license](https://img.shields.io/npm/l/@reaatech/agent-eval-harness-judge)](https://github.com/reaatech/agent-eval-harness/blob/main/packages/judge/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-eval-harness/ci.yml?branch=main)](https://github.com/reaatech/agent-eval-harness/actions)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Provider-agnostic LLM-as-judge engine with calibration and multi-model consensus. Scores agent responses on faithfulness, relevance, tool correctness, and overall quality using Claude, GPT-4, Gemini, or any OpenAI-compatible provider.

## Installation

```bash
npm install @reaatech/agent-eval-harness-judge
```

## Feature Overview

- **4 provider support** — Claude (Anthropic SDK), GPT-4 (OpenAI SDK), Gemini (Google Generative AI), OpenRouter (OpenAI-compatible) with automatic API key detection from environment variables
- **4 judgment types** — `faithfulness` (context adherence), `relevance` (intent alignment), `tool_correctness` (selection + arguments), `overall_quality` (multi-dimensional holistic assessment)
- **3 calibration methods** — Temperature scaling (grid search over logit temperature), isotonic regression (non-parametric rank-preserving), and linear regression fit against human labels
- **Multi-model consensus** — Weighted, majority, and unweighted voting strategies with tie-breaking by highest confidence or averaging
- **Built-in rate limiting** — Per-provider rate limits with automatic backoff (50 rpm Claude, 60 rpm GPT-4/Gemini, 30 rpm OpenRouter)
- **Retry with exponential backoff** — Configurable max retries (default 3) with doubling delay starting at 1s
- **Cost tracking** — Per-judgment cost estimation with provider-aware pricing, budget alerts at configurable thresholds (50%/75%/90%), and optimization recommendations
- **Mock fallback** — Returns `score: 0.85` when `NODE_ENV=test` or `JUDGE_MOCK=true` to enable offline testing
- **Custom prompt templates** — Pre-built templates for all judgment types plus `createCustomTemplate` for bespoke evaluation criteria

## Quick Start

```typescript
import { JudgeEngine } from '@reaatech/agent-eval-harness-judge';

const judge = new JudgeEngine({
  model: 'claude-opus',
  provider: 'claude',
  temperature: 0.1,
});

const result = await judge.judge({
  type: 'faithfulness',
  context: 'The account balance is $42.50',
  response: 'Your balance is $42.50. Would you like to make a payment?',
});

console.log(`Score: ${result.score}, Confidence: ${result.confidence}`);
console.log(result.explanation);
```

## API Reference

### JudgeEngine

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(config: JudgeConfig, retryConfig?: { maxRetries, baseDelayMs })` | Initializes engine with provider config, builds rate limiter |
| `judge` | `(request: JudgeRequest) => Promise<JudgeScore>` | Evaluates a single request with rate limiting and retry logic |
| `judgeBatch` | `(requests: Array<{ id, request: JudgeRequest }>, concurrency?: number) => Promise<BatchJudgeResult>` | Evaluates multiple requests with configurable concurrency (default 5) |

### JudgeCalibrator

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(method?: CalibrationMethod)` | Creates calibrator (default: `temperature_scaling`) |
| `addCalibrationData` | `(humanLabels: HumanLabel[], judgeScores: JudgeScore[]) => void` | Pairs human labels with raw judge scores as calibration points |
| `calibrate` | `() => CalibrationResult` | Fits calibration model against collected data (≥3 points required). Returns before/after MAE and improvement percentage |
| `apply` | `(rawScore: number) => number` | Transforms a raw judge score using fitted calibration parameters |
| `getIsCalibrated` | `() => boolean` | Returns whether calibration has been completed |

### ConsensusEngine

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(config: ConsensusConfig)` | Creates consensus engine with strategy and model weights |
| `consensus` | `(scores: Array<{ model, score: JudgeScore }>) => ConsensusResult` | Computes final score from multiple judges using configured voting strategy and agreement threshold |

### JudgeCostTracker

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(config?: JudgeCostConfig)` | Creates tracker with optional budget limit, max cost per judgment, alert thresholds, and custom pricing |
| `recordJudgment` | `(judgmentId, provider, model, inputTokens, outputTokens) => { cost, alerts }` | Records a judgment and returns cost + any budget alerts triggered |
| `estimateCost` | `(provider, estimatedInputTokens, estimatedOutputTokens) => number` | Estimates cost without recording |
| `canAfford` | `(estimatedCost) => { allowed, reason? }` | Checks if projected total would exceed budget |
| `getBreakdown` | `() => JudgeCostBreakdown` | Returns total cost, token counts, per-provider costs, and budget usage percentage |
| `getRemainingBudget` | `() => number` | Returns remaining budget (Infinity if no limit set) |
| `getOptimizationRecommendations` | `() => string[]` | Returns actionable cost-saving recommendations |

### Prompt Templates

| Function | Returns | Description |
|----------|---------|-------------|
| `getFaithfulnessTemplate` | `PromptTemplate` | Context-adherence scoring prompt with 0–1 rubric |
| `getRelevanceTemplate` | `PromptTemplate` | Intent-alignment scoring prompt with 0–1 rubric |
| `getToolCorrectnessTemplate` | `PromptTemplate` | Tool selection and argument validation prompt (includes `issues` field) |
| `getOverallQualityTemplate` | `PromptTemplate` | Multi-dimensional quality prompt with dimension-level scores (accuracy, completeness, clarity, helpfulness) |
| `getAvailableTemplates` | `Record<string, PromptTemplate>` | Returns all four built-in templates keyed by judgment type |
| `buildPrompt` | `{ system, user }` | Substitutes `PromptVariables` into a `PromptTemplate` |
| `createCustomTemplate` | `PromptTemplate` | Creates a custom template with name, system prompt, user prompt, and response format |

### Types

#### JudgeConfig

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | Primary judge model name |
| `provider` | `JudgeProvider` | One of `'claude' \| 'gpt4' \| 'gemini' \| 'openrouter'` |
| `fallbackModels` | `string[]?` | Fallback model chain for failover |
| `temperature` | `number?` | Sampling temperature (default: 0) |
| `maxTokens` | `number?` | Max output tokens |
| `apiKey` | `string?` | API key override (alternatively via env vars) |

#### JudgeRequest

| Field | Type | Description |
|-------|------|-------------|
| `type` | `JudgmentType` | `'faithfulness' \| 'relevance' \| 'tool_correctness' \| 'overall_quality'` |
| `context` | `string?` | Reference context for faithfulness/quality |
| `intent` | `string?` | User intent for relevance/quality |
| `response` | `string` | Agent response to evaluate |
| `expected_tool` | `string?` | Expected tool name (tool_correctness) |
| `actual_tool` | `string?` | Actual tool name (tool_correctness) |
| `arguments` | `Record<string, unknown>?` | Tool arguments (tool_correctness) |

#### JudgeScore

| Field | Type | Description |
|-------|------|-------------|
| `score` | `number` | Score from 0.0 to 1.0 |
| `explanation` | `string` | Human-readable explanation |
| `confidence` | `number` | Confidence in the score (0.0 to 1.0) |
| `calibrated` | `boolean` | Whether score has been calibrated |
| `rawScore` | `number?` | Pre-calibration score |
| `cost` | `number?` | Cost of this judge call in USD |

#### JudgeProvider

```
'claude' | 'gpt4' | 'gemini' | 'openrouter'
```

#### JudgmentType

```
'faithfulness' | 'relevance' | 'tool_correctness' | 'overall_quality'
```

### Calibration Methods

| Method | Description | Best For |
|--------|-------------|----------|
| `temperature_scaling` | Adjusts logit temperature via grid search (0.1–5.0) to minimize MAE. Keeps ranking intact. | Scores with consistent bias |
| `isotonic_regression` | Non-parametric least-squares fit preserving monotonicity. Approximated via linear slope + offset. | Non-linear calibration curves |
| `linear` | Simple linear regression (y = slope × x + intercept). Fastest calibration. | Scores with linear bias |

### Consensus Voting Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `weighted` | Score-weighted average using per-model weights from config | Best when model quality varies |
| `majority` | Bins scores into low (<0.33), medium (0.33–0.67), high (>0.67) and uses weighted majority vote | Quick pass/fail-style decisions |
| `unweighted` | Simple arithmetic mean of all scores | Equal confidence in all models |

## Advanced: Calibration with Human Labels

Human label calibration corrects systematic bias in LLM judge scores, aligning them with ground truth:

```typescript
import { JudgeCalibrator, JudgeEngine } from '@reaatech/agent-eval-harness-judge';

const calibrator = new JudgeCalibrator('temperature_scaling');

// Collect human-labeled samples
const humanLabels = [
  { sampleId: 's1', score: 0.80, type: 'faithfulness' },
  { sampleId: 's2', score: 0.95, type: 'faithfulness' },
  { sampleId: 's3', score: 0.60, type: 'faithfulness' },
];

// Get raw judge scores for the same samples
const judge = new JudgeEngine({ model: 'claude-sonnet-4-20250514', provider: 'claude' });
const judgeScores = await Promise.all([
  judge.judge({ type: 'faithfulness', context: '...', response: '...' }),
  judge.judge({ type: 'faithfulness', context: '...', response: '...' }),
  judge.judge({ type: 'faithfulness', context: '...', response: '...' }),
]);

calibrator.addCalibrationData(humanLabels, judgeScores);
const result = calibrator.calibrate();

console.log(`MAE: ${result.beforeMAE} → ${result.afterMAE} (${result.improvement}% improvement)`);

// Apply calibration to future scores
const futureScore = await judge.judge({ type: 'faithfulness', context: '...', response: '...' });
const calibrated = calibrator.apply(futureScore.score);
console.log(`Raw: ${futureScore.score}, Calibrated: ${calibrated}`);
```

## Advanced: Multi-Model Consensus

Combine multiple judge models to improve reliability and reduce single-model bias:

```typescript
import { ConsensusEngine } from '@reaatech/agent-eval-harness-judge';

const consensusEngine = new ConsensusEngine({
  enabled: true,
  models: [
    { id: 'claude-opus', weight: 0.5 },
    { id: 'gpt-4-turbo', weight: 0.3 },
    { id: 'gemini-pro', weight: 0.2 },
  ],
  votingStrategy: 'weighted',
  minAgreement: 0.7,
  tieBreaker: 'highest_confidence',
});

// Assume scores collected from three separate JudgeEngine instances
const consensusResult = consensusEngine.consensus([
  { model: 'claude-opus', score: { score: 0.85, confidence: 0.9, ... } },
  { model: 'gpt-4-turbo', score: { score: 0.78, confidence: 0.85, ... } },
  { model: 'gemini-pro', score: { score: 0.82, confidence: 0.8, ... } },
]);

console.log(`Consensus score: ${consensusResult.score}`);
console.log(`Agreement: ${consensusResult.agreement}`);
console.log(`Consensus reached: ${consensusResult.consensusReached}`);
```

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
| [@reaatech/agent-eval-harness-cli](https://www.npmjs.com/package/@reaatech/agent-eval-harness-cli) | CLI |
| [@reaatech/agent-eval-harness-observability](https://www.npmjs.com/package/@reaatech/agent-eval-harness-observability) | Observability |

## License

MIT
