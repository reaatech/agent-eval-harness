# Skill: LLM-as-Judge with Calibration

## What It Is

LLM-as-judge uses language models to evaluate agent quality. Calibration aligns judge scores with human labels, correcting for bias and variance. Multi-judge consensus improves accuracy through weighted voting.

## Why It Matters

- **Scalable Evaluation** — Automate quality assessment at scale
- **Consistent Scoring** — Remove human evaluator variability
- **Calibrated Scores** — Align with human judgment
- **Cost Control** — Track and limit judge expenses

## How to Use It

### Run Judge Evaluation

```bash
npx agent-eval-harness judge faithfulness \
  --context "The user's account is associated with email john@example.com" \
  --response "I've sent the password reset to john@example.com" \
  --model claude-opus
```

### Calibrate Judge

```typescript
import { JudgeCalibrator } from 'agent-eval-harness';

const calibrator = new JudgeCalibrator({
  humanLabelsPath: 'calibration/human-labels.jsonl',
  method: 'temperature_scaling',
});

await calibrator.calibrate();

// Apply calibration to new scores
const rawScore = 0.72;
const calibratedScore = calibrator.apply(rawScore);
console.log(`Calibrated: ${calibratedScore}`);
```

### Multi-Judge Consensus

```typescript
import { JudgeEngine } from 'agent-eval-harness';

const engine = new JudgeEngine({
  consensus: {
    enabled: true,
    models: [
      { id: 'claude-opus', weight: 0.5 },
      { id: 'gpt-4-turbo', weight: 0.3 },
      { id: 'gemini-pro', weight: 0.2 },
    ],
    voting_strategy: 'weighted',
    min_agreement: 0.7,
  },
});

const score = await engine.judge({ type: 'faithfulness', context, response });
console.log(`Consensus Score: ${score}`);
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `calibration_error` | Difference from human labels | <0.1 |
| `inter-judge_agreement` | Consensus rate | >0.7 |
| `judge_cost` | Cost per judgment | <$0.01 |
| `score_variance` | Score consistency | <0.05 |

## Calibration Methods

1. **Temperature Scaling** — Adjust score distribution
2. **Isotonic Regression** — Non-parametric calibration
3. **Platt Scaling** — Logistic regression calibration

## Best Practices

1. **Collect human labels** — Get 100+ labeled examples
2. **Validate calibration** — Check on held-out data
3. **Use consensus for critical evals** — Multiple judges improve accuracy
4. **Track judge costs** — Set budget limits
5. **Monitor drift** — Recalibrate periodically

## Common Pitfalls

- **No calibration** — Raw LLM scores often need adjustment
- **Too few human labels** — Need sufficient data for calibration
- **Ignoring cost** — Judge costs can add up at scale
- **Single judge** — Use consensus for important decisions

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [Faithfulness Scoring](../faithfulness-scoring/skill.md)
- [Relevance Scoring](../relevance-scoring/skill.md)
- [Cost Tracking](../cost-tracking/skill.md)
