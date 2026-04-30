# Skill: Relevance Scoring

## What It Is

Relevance scoring measures whether an agent's response appropriately addresses the user's intent. It evaluates if the response is on-topic, helpful, and directly answers the user's query. Available via the `eval.judge.relevance` MCP tool, CLI judge command, and programmatic API.

## Why It Matters

- **User Satisfaction** — Relevant responses lead to better UX
- **Intent Understanding** — Verify agents grasp user needs
- **Quality Assurance** — Catch off-topic or unhelpful responses
- **Performance Monitoring** — Track relevance trends over time

## How to Use It

### CLI: Score Relevance

```bash
npx agent-eval-harness judge relevance \
  --intent "User wants to reset their password" \
  --response "I can help with that. What's your email address?" \
  --model claude-opus \
  --calibrated
```

### MCP Tool

```json
{
  "name": "eval.judge.relevance",
  "arguments": {
    "intent": "User wants to reset their password",
    "response": "I can help with that. What's your email address?"
  }
}
```

### Programmatic Usage

```typescript
import { JudgeEngine } from '@reaatech/agent-eval-harness';

const engine = new JudgeEngine({
  model: 'claude-opus',
  provider: 'claude',
  temperature: 0.1,
});

const result = await engine.judge({
  type: 'relevance',
  intent: "Reset password",
  response: "I can help. What's your email?",
});

console.log(`Score: ${result.score}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Explanation: ${result.explanation}`);
```

### Batch Relevance

```typescript
const scores = await engine.judgeBatch([
  { id: '1', request: { type: 'relevance', intent: '...', response: '...' } },
  { id: '2', request: { type: 'relevance', intent: '...', response: '...' } },
]);
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `relevance_score` | Intent-response alignment | >0.85 |
| `helpfulness_score` | Response utility | >0.80 |
| `on_topic_rate` | Stays on subject | >0.95 |

## Scoring Criteria

1. **Intent Alignment** — Response addresses the user's goal
2. **Completeness** — Provides sufficient information
3. **Conciseness** — Not overly verbose or tangential
4. **Actionability** — Gives clear next steps when appropriate

## Prompt Template

The relevance prompt includes:
- System message defining the evaluation task
- User intent and agent response to evaluate
- Scoring rubric (0-1 scale)
- Required output format: `{ score, explanation, confidence }`

Custom templates available via `createCustomTemplate()`.

## Best Practices

1. **Define clear intents** — Be specific about user goals
2. **Use calibrated judges** — Align with human assessment
3. **Combine with faithfulness** — Relevance + accuracy = quality
4. **Monitor trends** — Track relevance over time

## Common Pitfalls

- **Missing provider** — JudgeConfig must include `provider` (e.g., `'claude'`)
- **Vague intents** — Be specific about what the user wants
- **Ignoring context** — Consider conversation history
- **Low thresholds** — Relevance should be consistently high
- **Single metric** — Use with other quality measures

## Related Skills

- [Faithfulness Scoring](../faithfulness-scoring/skill.md)
- [Tool-Use Validation](../tool-use-validation/skill.md)
- [LLM Judge](../llm-judge-calibrated/skill.md)
