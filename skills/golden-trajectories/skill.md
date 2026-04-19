# Skill: Golden Trajectories

## What It Is

Golden trajectories are reference implementations — perfect executions of agent scenarios used as benchmarks for regression testing. They define the expected behavior against which new runs are compared.

## Why It Matters

- **Regression Detection** — Catch quality degradation before production
- **Quality Baseline** — Define what "good" looks like
- **Consistent Evaluation** — Standardize quality assessment
- **Documentation** — Golden trajectories document expected behavior

## How to Use It

### Create a Golden Trajectory

1. Record a perfect agent execution
2. Annotate with expected outcomes
3. Store in JSONL format

```jsonl
{"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z", "golden": true}
{"turn_id": 1, "role": "agent", "content": "I can help with that. What's your email?", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z", "expected": true, "quality_notes": "Polite, asks for necessary information"}
{"turn_id": 2, "role": "user", "content": "john@example.com", "timestamp": "2026-04-15T23:00:05Z"}
{"turn_id": 2, "role": "agent", "content": "Password reset sent!", "tool_calls": [{"name": "send_reset_email", "arguments": {"email": "john@example.com"}, "result": {"status": "sent"}}], "timestamp": "2026-04-15T23:00:06Z", "expected": true, "quality_notes": "Correct tool, proper arguments, confirms action"}
```

### Compare Against Golden

```bash
npx agent-eval-harness eval trajectories/run.jsonl \
  --golden golden/password-reset.jsonl \
  --similarity-threshold 0.85 \
  --output results/
```

### Programmatic Comparison

```typescript
import { compareAgainstGolden, loadGoldenTrajectories } from 'agent-eval-harness';

const golden = loadGoldenTrajectories('golden/password-reset.jsonl');
const result = await compareAgainstGolden('trajectories/new-run.jsonl', golden, {
  similarityThreshold: 0.85,
});

console.log(`Similarity: ${(result.similarity * 100).toFixed(1)}%`);
console.log(`Regressions: ${result.regressions.length}`);

for (const regression of result.regressions) {
  console.log(`  - ${regression.metric}: ${regression.baseline} → ${regression.current}`);
}
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `similarity` | Overall similarity to golden | >0.85 |
| `turn_similarity` | Per-turn similarity | >0.80 |
| `tool_similarity` | Tool usage similarity | >0.90 |
| `regressions` | Count of regressions | 0 |

## Best Practices

1. **Cover critical scenarios** — Create goldens for high-impact use cases
2. **Update regularly** — Keep goldens current with product changes
3. **Document quality notes** — Explain why each turn is good
4. **Use version control** — Track golden trajectory changes
5. **Set appropriate thresholds** — Balance sensitivity vs. noise

## Common Pitfalls

- **Too few goldens** — Cover all critical user journeys
- **Outdated goldens** — Review and update regularly
- **Unrealistic expectations** — Goldens should be achievable
- **No documentation** — Always add quality_notes

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [Regression Suites](../regression-suites/skill.md)
- [Eval Gating](../eval-gating/skill.md)
