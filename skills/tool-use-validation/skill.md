# Skill: Tool-Use Validation

## What It Is

Tool-use validation verifies that agents select the correct tools, provide valid arguments, and properly use tool results. It catches tool misuse, argument errors, and result hallucination through three validation layers: tool selection (13 issue types), schema compliance (JSON Schema via ajv), and result verification (8 issue types including hallucination detection).

## Why It Matters

- **Correctness** — Ensure agents use the right tool for each intent
- **Safety** — Prevent invalid tool arguments that could cause errors
- **Reliability** — Catch agents that ignore or hallucinate tool results
- **Debugging** — Identify systematic tool selection issues

## How to Use It

### CLI: Validate Tool Correctness

```bash
npx agent-eval-harness judge tool_correctness \
  --expected-tool send_email \
  --actual-tool send_email \
  --arguments '{"to": "user@example.com", "body": "Hello"}' \
  --result '{"status": "sent"}'
```

### Schema-Only Validation

```typescript
import { validateSchema, createToolSchema } from '@reaatech/agent-eval-harness';

const schema = createToolSchema({
  parameters: {
    to: { type: 'string', format: 'email' },
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['to', 'body'],
});

const result = validateSchema(toolCall, schema);
console.log(`Valid: ${result.valid}`);
console.log(`Issues: ${result.issues.map(i => i.message)}`);
```

### Full Trajectory Validation

```typescript
import { validateTrajectory, createToolSchema } from '@reaatech/agent-eval-harness';

const schemas = {
  send_email: createToolSchema({
    parameters: {
      to: { type: 'string', format: 'email' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['to', 'body'],
  }),
};

// validateTrajectory(trajectory, toolSchemas, options?)
const results = validateTrajectory(trajectory, schemas, { strictMode: true });

for (const result of results) {
  console.log(`Valid: ${result.valid}, Issues: ${result.issues.length}`);
}
```

### Result Verification (Hallucination Detection)

```typescript
import { verifyResult } from '@reaatech/agent-eval-harness';

const verification = verifyResult(toolCall, toolSchemas);
console.log(`Has hallucination: ${verification.hasHallucination}`);
console.log(`Issues: ${verification.issues.map(i => i.type)}`);
```

## Key Metrics

| Metric | Description | Range |
|--------|-------------|-------|
| `tool_selection_accuracy` | Correct tool chosen | 0-1 |
| `argument_validity` | Arguments match schema | 0-1 |
| `result_usage` | Results used correctly | 0-1 |
| `hallucination_rate` | Hallucinated results | 0-1 |

## Validation Rules

1. **Tool Selection** (13 issue types) — Is the chosen tool appropriate?
2. **Schema Compliance** — Do arguments match the tool's JSON Schema?
3. **Required Fields** — Are all required arguments provided?
4. **Type Checking** — Are argument types correct?
5. **Result Integration** (8 issue types) — Does the agent use the actual tool result? Check for hallucination, contradictions, and integration issues.

## Best Practices

1. **Define clear schemas** — Every tool should have a JSON Schema
2. **Validate early** — Catch schema violations before execution
3. **Check result usage** — Verify agents don't hallucinate results
4. **Track patterns** — Identify systematic tool misuse
5. **Use strict mode** — Reject unknown tools by default

## Common Pitfalls

- **Missing schemas** — Define schemas for all tools
- **Loose validation** — Use strict mode in production
- **Ignoring results** — Verify agents use actual tool outputs
- **No error handling** — Check how agents handle tool failures

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [Faithfulness Scoring](../faithfulness-scoring/skill.md)
- [LLM Judge](../llm-judge-calibrated/skill.md)
