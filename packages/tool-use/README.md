# @reaatech/agent-eval-harness-tool-use

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-eval-harness-tool-use)](https://www.npmjs.com/package/@reaatech/agent-eval-harness-tool-use)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/agent-eval-harness/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Tool-call validation and result verification for agent trajectories. Validates tool selection against schemas, checks argument compliance, detects hallucinated results, and verifies proper result integration into agent responses.

## Installation

```bash
npm install @reaatech/agent-eval-harness-tool-use
```

## Feature Overview

- **Tool selection validation** — checks that the agent picked the right tool for the task
- **Schema compliance** — validates tool arguments against JSON Schema or custom ToolSchema definitions
- **Result verification** — detects hallucinated results that don't match actual tool output
- **Integration checking** — verifies tool results are properly used in agent responses
- **13 issue types** — structured categorization of tool-use problems from critical (missing tool name) to low (result unused)
- **Trajectory-wide summarization** — aggregate result verification across all tool calls

## Quick Start

```typescript
import { validateToolCall, createToolSchema, verifyResult } from '@reaatech/agent-eval-harness-tool-use';
import type { ToolCall, Turn } from '@reaatech/agent-eval-harness-types';

const schema = createToolSchema('send_email', {
  properties: { to: { type: 'string', format: 'email' }, subject: { type: 'string' } },
  required: ['to']
});

const call: ToolCall = { name: 'send_email', arguments: { to: 'user@example.com', subject: 'Hi' }, result: { status: 'sent' } };
const turn: Turn = { turn_id: 2, role: 'agent', content: 'Email sent!', timestamp: '2026-04-15T00:00:00Z', tool_calls: [call] };

const validation = validateToolCall(call, schema);
console.log(`Valid: ${validation.valid}, Score: ${validation.score}`);

const verification = verifyResult(call, turn);
console.log(`Hallucinated: ${verification.hallucinated}, Integrated: ${verification.integrated}`);
```

## API Reference

### Validation Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `validateTrajectory` | `(trajectory: Trajectory, toolSchemas?: Record<string, ToolSchema>, options?: ValidateOptions) => ValidationResult[]` | Validates all tool calls across every agent turn in a trajectory. Returns one `ValidationResult` per agent turn with tool calls. |
| `validateTurn` | `(turn: Turn, toolSchemas?: Record<string, ToolSchema>, options?: ValidateOptions) => ValidationResult` | Validates all tool calls in a single turn. Handles `missing_tool_name`, `unknown_tool`, `deprecated_tool`, `missing_arguments`, `missing_result`, schema violations, and hallucination detection. |
| `validateToolCall` | `(toolCall: ToolCall, schema?: ToolSchema, options?: ValidateOptions) => ValidationResult` | Validates a single tool call against an optional schema. Convenience wrapper that creates a synthetic turn internally. |

### Schema Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `validateSchema` | `(toolCall: ToolCall, schema: ToolSchema) => SchemaValidationResult` | Deep schema validation of tool arguments against a `ToolSchema`. Checks required fields, types, enums, formats (`email`, `uri`, `date`, `date-time`), and nested object/array properties. |
| `createToolSchema` | `(name: string, jsonSchema: Record<string, unknown>, description?: string) => ToolSchema` | Creates a `ToolSchema` from a JSON Schema-like definition. Converts `properties` and `required` arrays into the internal `ToolSchema` parameter structure. |

### Result Verification Functions

| Export | Signature | Description |
|--------|-----------|-------------|
| `verifyResult` | `(toolCall: ToolCall, turn: Turn, trajectory?: Trajectory, options?: VerifyOptions) => ResultVerificationResult` | Verifies a single tool call's result against the agent's response. Checks for hallucination, result integration, contradictions, and missing/empty/error results. Accepts optional full trajectory for cross-turn usage detection. |
| `verifyTurnResults` | `(turn: Turn, trajectory?: Trajectory, options?: VerifyOptions) => ResultVerificationResult[]` | Runs `verifyResult` on every tool call in a turn. Returns an array of verification results. |
| `summarizeResultVerification` | `(trajectory: Trajectory, options?: VerifyOptions) => { totalTools, validResults, hallucinatedResults, integratedResults, averageScore, issues }` | Aggregates result verification across an entire trajectory. Returns counts for total tools, valid results, hallucinated results, integrated results, average score, and all issues. |

### Types

#### ToolSchema

```typescript
interface ToolSchema {
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
  deprecated?: boolean;
  replacedBy?: string;
}

interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: unknown[];
  format?: string;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
}
```

#### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;          // true if no critical issues
  issues: ToolUseIssue[];  // all detected issues
  suggestions: string[];   // remediation suggestions (e.g., deprecated tool replacement)
  score: number;           // 0.0–1.0 weighted by issue severity
}

interface ToolUseIssue {
  type: ToolUseIssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  turnId?: number;
  toolName?: string;
  details?: Record<string, unknown>;
}
```

#### ValidateOptions

```typescript
interface ValidateOptions {
  allowUnknownTools?: boolean;   // default: false — set true to skip unknown tool errors
  validateSchemas?: boolean;     // default: true — enable parameter-level schema checks
  checkResultUsage?: boolean;    // default: true — check for unused tool results
  detectHallucination?: boolean; // default: true — check for fabricated result usage
  strict?: boolean;              // default: false — when true, score drops to 0.0 if any high/critical issue
}
```

#### SchemaValidationResult

```typescript
interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaIssue[];
  score: number;
}

interface SchemaIssue {
  type: string;         // e.g., 'missing_arguments', 'type_error', 'invalid_format', 'required_field_missing'
  severity: 'low' | 'medium' | 'high' | 'critical';
  path: string;         // dot-notation path to the problematic parameter
  message: string;
  expected?: unknown;
  actual?: unknown;
}
```

#### ResultVerificationResult

```typescript
interface ResultVerificationResult {
  valid: boolean;
  issues: ResultIssue[];
  score: number;
  hallucinated: boolean;  // true if hallucination score exceeds threshold
  integrated: boolean;    // true if result values appear in the agent response
}

interface ResultIssue {
  type: ResultIssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  turnId?: number;
  toolName?: string;
  details?: Record<string, unknown>;
}
```

#### VerifyOptions

```typescript
interface VerifyOptions {
  checkUsage?: boolean;             // default: true — verify result usage in response
  detectHallucination?: boolean;    // default: true — detect fabricated result content
  checkContradictions?: boolean;    // default: true — catch result/response contradictions
  hallucinationThreshold?: number;  // default: 0.3 — score above this triggers hallucinated flag
}
```

### Enums

#### ToolUseIssueType (13 values)

| Value | Severity | Description |
|-------|----------|-------------|
| `missing_tool_name` | critical | Tool call has no `name` field |
| `missing_arguments` | high | Tool call has no `arguments` field |
| `invalid_arguments` | medium | Argument value not in allowed enum |
| `tool_not_found` | high | Tool name not in provided schemas |
| `tool_misuse` | medium | Tool used incorrectly for the context |
| `missing_result` | medium | Tool was called but no result returned |
| `result_unused` | low | Tool result fields not found in agent response |
| `hallucinated_result` | high | Agent response references data not in the actual tool result |
| `schema_violation` | high | Arguments fail schema-level validation |
| `type_mismatch` | high | Argument type does not match schema (e.g., string for number) |
| `missing_required_param` | high | Required parameter missing from arguments |
| `unknown_tool` | high/medium | Tool name not recognized; severity depends on `strict` mode |
| `deprecated_tool` | medium | Tool is marked as deprecated; suggestion includes replacement |

#### ResultIssueType (8 values)

| Value | Severity | Description |
|-------|----------|-------------|
| `missing_result` | medium | Tool call has no result object |
| `empty_result` | low | Tool returned an empty result (`{}`) |
| `error_result` | high | Result status is `'error'` |
| `hallucinated_content` | high | Response contains fabricated data not in the result |
| `unused_result` | medium | Result values not referenced in agent response |
| `contradicts_response` | high | Result indicates success but response says failure (or vice versa) |
| `incomplete_integration` | medium | Only partial result data used in response |
| `malformed_result` | high | Result structure is unexpected or invalid |

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
