# Skill: LLM-as-Judge with Calibration

## What It Is

LLM-as-judge uses language models to evaluate agent quality. Calibration aligns judge scores with human labels, correcting for bias and variance using three methods (temperature_scaling, isotonic_regression, linear). Multi-judge consensus improves accuracy through weighted/majority/unweighted voting. Supports four providers: claude (Anthropic), gpt4 (OpenAI), gemini (Google), and openrouter (OpenAI-compatible).

## Why It Matters

- **Scalable Evaluation** — Automate quality assessment at scale
- **Consistent Scoring** — Remove human evaluator variability
- **Calibrated Scores** — Align with human judgment
- **Cost Control** — Track and limit judge expenses

## How to Use It

### CLI: Run Judge

```bash
npx agent-eval-harness judge faithfulness \
  --context "Account email: john@example.com" \
  --response "I've sent the reset to john@example.com" \
  --model claude-opus \
  --calibrated
```

### Programmatic: Judge Engine

```typescript
import { JudgeEngine } from '@reaatech/agent-eval-harness';

const engine = new JudgeEngine({
  model: 'claude-opus',
  provider: 'claude',       // 'claude' | 'gpt4' | 'gemini' | 'openrouter'
  fallbackModels: ['gpt-4-turbo'],
  temperature: 0.1,
});

const score = await engine.judge({
  type: 'faithfulness',
  context: "Account email: john@example.com",
  response: "I've emailed john@example.com",
});

console.log(`Score: ${score.score}, Confidence: ${score.confidence}`);
```

### Batch Judgment

```typescript
const batchResult = await engine.judgeBatch([
  { id: 'sample-1', request: { type: 'faithfulness', context: '...', response: '...' } },
  { id: 'sample-2', request: { type: 'relevance', intent: '...', response: '...' } },
], 5); // concurrency

console.log(`Completed: ${batchResult.completedSamples}/${batchResult.totalSamples}`);
console.log(`Total cost: $${batchResult.totalCost}`);
```

### Calibrate Judge

```typescript
import { JudgeCalibrator } from '@reaatech/agent-eval-harness';

const calibrator = new JudgeCalibrator('temperature_scaling');

// addCalibrationData(humanLabels: HumanLabel[], judgeScores: JudgeScore[])
calibrator.addCalibrationData(humanLabels, judgeScores);
const result = await calibrator.calibrate();

console.log(`Before MAE: ${result.beforeMAE}`);
console.log(`After MAE: ${result.afterMAE}`);
console.log(`Improvement: ${result.improvement}%`);

// apply(rawScore) returns calibrated number
const calibrated = calibrator.apply(0.72);
```

### Consensus Voting

```typescript
import { ConsensusEngine } from '@reaatech/agent-eval-harness';

const consensus = new ConsensusEngine({ votingStrategy: 'weighted' });
consensus.addVote({ model: 'claude-opus', score: 0.85, confidence: 0.9, weight: 0.5 });
consensus.addVote({ model: 'gpt-4-turbo', score: 0.78, confidence: 0.85, weight: 0.3 });
consensus.addVote({ model: 'gemini-pro', score: 0.82, confidence: 0.8, weight: 0.2 });

const result = consensus.compute();
console.log(`Consensus: ${result.score}, Agreement: ${result.agreement}`);
```

### Judge Cost Tracking

```typescript
import { JudgeCostTracker } from '@reaatech/agent-eval-harness';

const costTracker = new JudgeCostTracker({ budgetLimit: 50.00 });

if (costTracker.canAfford(estimate)) {
  const result = await engine.judge(request);
  costTracker.recordJudgment(result.cost);
}

console.log(costTracker.getBreakdown());
```

### Custom Prompt Templates

```typescript
import { createCustomTemplate, buildPrompt } from '@reaatech/agent-eval-harness';

const template = createCustomTemplate('my_metric', {
  system: 'You are evaluating agent responses.',
  user: 'Context: {context}\nResponse: {response}\nScore 0-1:',
  responseFormat: '{ "score": number, "explanation": string }',
});

const { system, user } = buildPrompt(template, { context, response });
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `calibration_error` | MAE from human labels | <0.1 |
| `inter-judge_agreement` | Consensus rate | >0.7 |
| `judge_cost` | Cost per judgment | <$0.01 |
| `score_variance` | Score consistency | <0.05 |

## Calibration Methods

| Method | Description |
|--------|-------------|
| `temperature_scaling` | Adjusts logit temperature via grid search to minimize MAE |
| `isotonic_regression` | Non-parametric calibration preserving ranking |
| `linear` | Simple linear regression fit |

## Supported Providers

| Provider | Config Value | Model Examples | Rate Limit |
|----------|-------------|----------------|------------|
| Anthropic | `claude` | claude-opus, claude-sonnet, claude-haiku | 50/min |
| OpenAI | `gpt4` | gpt-4-turbo, gpt-4, gpt-4-mini | 60/min |
| Google | `gemini` | gemini-pro, gemini-flash | 60/min |
| OpenRouter | `openrouter` | Any OpenAI-compatible | 30/min |

## Available Judge Types

| Type | Required Fields | Template |
|------|----------------|----------|
| `faithfulness` | context, response | getFaithfulnessTemplate() |
| `relevance` | intent, response | getRelevanceTemplate() |
| `tool_correctness` | response, expected_tool, actual_tool, arguments? | getToolCorrectnessTemplate() |
| `overall_quality` | response, context?, intent? | getOverallQualityTemplate() |

## Best Practices

1. **Collect human labels** — Get 100+ labeled examples for calibration
2. **Validate calibration** — Check on held-out data
3. **Use consensus for critical evals** — Multiple judges improve accuracy
4. **Track judge costs** — Set budget limits with JudgeCostTracker
5. **Monitor drift** — Recalibrate periodically

## Common Pitfalls

- **No provider set** — JudgeConfig requires both `model` and `provider`
- **No calibration** — Raw LLM scores often need adjustment
- **Too few human labels** — Need sufficient data for calibration
- **Ignoring cost** — Judge costs can add up at scale
- **Single judge** — Use consensus for important decisions

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [Faithfulness Scoring](../faithfulness-scoring/skill.md)
- [Relevance Scoring](../relevance-scoring/skill.md)
- [Cost Tracking](../cost-tracking/skill.md)
