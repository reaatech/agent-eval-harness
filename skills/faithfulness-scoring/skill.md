# Skill: Faithfulness Scoring

## What It Is

Faithfulness scoring measures whether an agent's response is grounded in and consistent with the provided context. It detects hallucination, fabrication, and context drift.

## Why It Matters

- **Hallucination Detection** — Catch fabricated information
- **Context Adherence** — Ensure responses use provided information
- **Trust Building** — Users need reliable, accurate responses
- **Safety** — Prevent spreading misinformation

## How to Use It

### Score Faithfulness

```bash
npx agent-eval-harness judge faithfulness \
  --context "The user's account is associated with email john@example.com. Their subscription expires on 2026-05-01." \
  --response "I've sent the password reset to john@example.com" \
  --model claude-opus
```

### Batch Evaluation

```typescript
import { JudgeEngine } from 'agent-eval-harness';

const engine = new JudgeEngine({
  model: 'claude-opus',
  calibration: { enabled: true },
});

const result = await engine.judge({
  type: 'faithfulness',
  context: "Account email: john@example.com",
  response: "I've emailed john@example.com",
});

console.log(`Score: ${result.score} - ${result.explanation}`);
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `faithfulness_score` | Context adherence | >0.85 |
| `hallucination_rate` | Fabricated information | <0.05 |
| `context_usage` | Proper context utilization | >0.90 |

## Scoring Criteria

1. **Factual Accuracy** — All claims match the context
2. **No Fabrication** — No invented details
3. **Complete Usage** — Relevant context is used
4. **No Contradiction** — Response doesn't contradict context

## Best Practices

1. **Use calibrated judges** — Align with human assessment
2. **Set high thresholds** — Faithfulness is critical for trust
3. **Review failures** — Analyze hallucination patterns
4. **Combine with other metrics** — Faithfulness alone isn't sufficient

## Common Pitfalls

- **Low thresholds** — Faithfulness should be near-perfect
- **Ignoring edge cases** — Check boundary conditions
- **No calibration** — Raw scores may be inflated
- **Single judge** — Use consensus for critical applications

## Related Skills

- [Tool-Use Validation](../tool-use-validation/skill.md)
- [Relevance Scoring](../relevance-scoring/skill.md)
- [LLM Judge](../llm-judge-calibrated/skill.md)
