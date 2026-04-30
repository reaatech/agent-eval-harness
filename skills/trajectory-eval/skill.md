# Skill: Trajectory Evaluation

## What It Is

Trajectory evaluation assesses the quality of complete agent executions — multi-turn conversations with tool invocations and task completion. Unlike single-turn evaluation, trajectory evaluation considers conversation coherence, goal completion, and turn-by-turn quality.

## Why It Matters

- **Holistic Quality** — Single-turn metrics miss conversation-level issues
- **Goal Completion** — Did the agent actually solve the user's problem?
- **Coherence** — Does the conversation flow logically?
- **Regression Detection** — Catch quality degradation across releases

## How to Use It

### CLI: Evaluate a Trajectory

```bash
# Single file
npx agent-eval-harness eval trajectories/run-001.jsonl --output results/

# Multiple files (glob)
npx agent-eval-harness eval trajectories/*.jsonl --output results/

# With golden comparison
npx agent-eval-harness eval trajectories/run-001.jsonl \
  --golden golden/password-reset.jsonl \
  --output results/
```

### Programmatic: Evaluate a Trajectory

```typescript
import { loadFromFile, evaluate, compare } from '@reaatech/agent-eval-harness';

// loadFromFile returns Trajectory[]
const trajectories = await loadFromFile('trajectories/run-001.jsonl');

for (const trajectory of trajectories) {
  // evaluate() is synchronous, returns EvalResult
  const result = evaluate(trajectory, {
    checkCoherence: true,
    checkGoalCompletion: true,
    analyzeFlow: true,
  });

  console.log(`Overall Score: ${result.overall_score}`);
  console.log(`Goal Completed: ${result.goal_completed}`);
}
```

### Compare Two Trajectories

```typescript
import { compare } from '@reaatech/agent-eval-harness';

const diff = compare(goldenTrajectory, candidateTrajectory);
console.log(`Similarity: ${diff.similarity}`);
console.log(`Turn diffs: ${diff.turnDiffs.length}`);
```

## Key Metrics

| Metric | Description | Range |
|--------|-------------|-------|
| `overall_score` | Combined quality score | 0-1 |
| `coherence` | Conversation flow quality | 0-1 |
| `goal_completion` | Task completion rate | 0-1 |
| `turn_quality` | Average per-turn quality | 0-1 |

## Best Practices

1. **Use JSONL format** — One turn per line for easy streaming
2. **Include timestamps** — Required for latency analysis
3. **Add tool results** — Essential for tool-use validation
4. **Compare against golden** — Detect regressions early
5. **Track trends** — Monitor quality over time

## Common Pitfalls

- **Missing required fields** — Ensure turn_id, role, content, timestamp
- **Incomplete tool calls** — Always include arguments and results
- **No goal definition** — Define success criteria for each scenario
- **Ignoring coherence** — Multi-turn quality ≠ average of single-turn quality

## Related Skills

- [Golden Trajectories](../golden-trajectories/skill.md)
- [Tool-Use Validation](../tool-use-validation/skill.md)
- [Regression Suites](../regression-suites/skill.md)
