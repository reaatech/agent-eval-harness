import type { ToolCall, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import { validateToolCall, validateTrajectory, validateTurn } from './validator.js';
import type { ToolSchema, ValidateOptions } from './validator.js';

function makeTurn(overrides: { [K in keyof Turn]?: Turn[K] | undefined } = {}): Turn {
  const result: Record<string, unknown> = {
    turn_id: 1,
    role: 'agent',
    content: '',
    timestamp: '2026-04-17T12:00:00Z',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete result[k];
    } else {
      result[k] = v;
    }
  }
  return result as unknown as Turn;
}

function makeToolCall(
  overrides: { [K in keyof ToolCall]?: ToolCall[K] | undefined } = {},
): ToolCall {
  const result: Record<string, unknown> = {
    name: 'send_email',
    arguments: { to: 'john@example.com', subject: 'Hello' },
    result: { status: 'sent', id: 'msg-123' },
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete result[k];
    } else {
      result[k] = v;
    }
  }
  return result as unknown as ToolCall;
}

function makeTrajectory(turns: Turn[]): Trajectory {
  return { turns };
}

const sendEmailSchema: ToolSchema = {
  name: 'send_email',
  description: 'Send an email',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', format: 'email' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['to', 'subject'],
  },
};

const searchSchema: ToolSchema = {
  name: 'search',
  description: 'Search for information',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
      include_metadata: { type: 'boolean' },
      filters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          date_range: { type: 'string' },
        },
      },
      tags: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['active', 'archived', 'deleted'] },
    },
    required: ['query'],
  },
};

const deprecatedSchema: ToolSchema = {
  name: 'old_search',
  description: 'Legacy search',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string' },
    },
    required: ['q'],
  },
  deprecated: true,
  replacedBy: 'search',
};

describe('validateToolCall', () => {
  it('returns valid for a correct tool call with matching schema', () => {
    const toolCall = makeToolCall();
    const result = validateToolCall(toolCall, sendEmailSchema);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(1.0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('returns valid when no schema is provided and unknown tools allowed', () => {
    const toolCall = makeToolCall();
    const result = validateToolCall(toolCall, undefined, {
      detectHallucination: false,
      allowUnknownTools: true,
    });

    expect(result.valid).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('detects missing tool name', () => {
    const toolCall = makeToolCall({ name: '' as string });
    const result = validateToolCall(toolCall);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing_tool_name')).toBe(true);
    expect(result.issues[0]?.severity).toBe('critical');
  });

  it('detects unknown tool when schema does not match', () => {
    const toolCall = makeToolCall({ name: 'nonexistent_tool' });
    const schemas: Record<string, ToolSchema> = { send_email: sendEmailSchema };
    const result = validateToolCall(
      toolCall,
      schemas.nonexistent_tool ? schemas.nonexistent_tool : undefined,
    );

    expect(result.issues.some((i) => i.type === 'unknown_tool')).toBe(true);
  });

  it('detects missing arguments', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: undefined as unknown as Record<string, unknown>,
    };
    const result = validateToolCall(toolCall, sendEmailSchema);

    expect(result.issues.some((i) => i.type === 'missing_arguments')).toBe(true);
    expect(result.issues.some((i) => i.type === 'missing_required_param')).toBe(true);
  });

  it('detects missing required parameters', () => {
    const toolCall = makeToolCall({
      name: 'send_email',
      arguments: { to: 'john@example.com' },
    });
    const result = validateToolCall(toolCall, sendEmailSchema);

    expect(result.issues.some((i) => i.type === 'missing_required_param')).toBe(true);
    expect(result.issues.some((i) => i.description.includes('subject'))).toBe(true);
  });

  it('detects type mismatch in parameters', () => {
    const toolCall = makeToolCall({
      name: 'search',
      arguments: { query: 'test', limit: 'not_a_number' },
    });
    const result = validateToolCall(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_mismatch')).toBe(true);
  });

  it('detects deprecated tool usage', () => {
    const toolCall = makeToolCall({
      name: 'old_search',
      arguments: { q: 'test' },
    });
    const result = validateToolCall(toolCall, deprecatedSchema);

    expect(result.issues.some((i) => i.type === 'deprecated_tool')).toBe(true);
    expect(result.suggestions.some((s) => s.includes('search'))).toBe(true);
  });

  it('detects missing result', () => {
    const toolCall = makeToolCall({ result: undefined });
    const result = validateToolCall(toolCall, sendEmailSchema);

    expect(result.issues.some((i) => i.type === 'missing_result')).toBe(true);
  });

  it('respects allowUnknownTools option', () => {
    const toolCall = makeToolCall({ name: 'mystery_tool' });
    const options: ValidateOptions = { allowUnknownTools: true };
    const result = validateToolCall(toolCall, undefined, options);

    expect(result.issues.some((i) => i.type === 'unknown_tool')).toBe(false);
  });

  it('flags unknown tool when allowUnknownTools is false', () => {
    const toolCall = makeToolCall({ name: 'mystery_tool' });
    const options: ValidateOptions = { allowUnknownTools: false };
    const result = validateToolCall(toolCall, undefined, options);

    expect(result.issues.some((i) => i.type === 'unknown_tool')).toBe(true);
  });

  it('respects strict mode for scoring', () => {
    const toolCall = makeToolCall({
      name: '',
      arguments: undefined as unknown as Record<string, unknown>,
    });
    const options: ValidateOptions = { strict: true };
    const result = validateToolCall(toolCall, undefined, options);

    expect(result.score).toBe(0.0);
  });

  it('skips schema validation when validateSchemas is false', () => {
    const toolCall = makeToolCall({
      name: 'send_email',
      arguments: {},
    });
    const options: ValidateOptions = { validateSchemas: false };
    const result = validateToolCall(toolCall, sendEmailSchema, options);

    expect(result.issues.some((i) => i.type === 'missing_required_param')).toBe(false);
  });

  it('skips missing result check when checkResultUsage is false', () => {
    const toolCall = makeToolCall({ result: undefined });
    const options: ValidateOptions = { checkResultUsage: false };
    const result = validateToolCall(toolCall, sendEmailSchema, options);

    expect(result.issues.some((i) => i.type === 'missing_result')).toBe(false);
  });

  it('validates enum values in parameters', () => {
    const toolCall = makeToolCall({
      name: 'search',
      arguments: { query: 'test', status: 'invalid_status' },
    });
    const result = validateToolCall(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'invalid_arguments')).toBe(true);
  });

  it('accepts valid enum values', () => {
    const toolCall = makeToolCall({
      name: 'search',
      arguments: { query: 'test', status: 'active' },
    });
    const result = validateToolCall(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'invalid_arguments')).toBe(false);
  });

  it('detects array type mismatch', () => {
    const toolCall = makeToolCall({
      name: 'search',
      arguments: { query: 'test', tags: 'not_an_array' },
    });
    const result = validateToolCall(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_mismatch')).toBe(true);
    expect(result.issues.some((i) => i.details?.expected === 'array')).toBe(true);
  });

  it('accepts valid array arguments', () => {
    const toolCall = makeToolCall({
      name: 'search',
      arguments: { query: 'test', tags: ['tag1', 'tag2'] },
    });
    const result = validateToolCall(toolCall, searchSchema);

    expect(result.valid).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

describe('validateTurn', () => {
  it('returns valid for a turn with no tool calls', () => {
    const turn = makeTurn({ tool_calls: undefined });
    const result = validateTurn(turn);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(1.0);
  });

  it('returns valid for a turn with empty tool calls', () => {
    const turn = makeTurn({ tool_calls: [] });
    const result = validateTurn(turn);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('validates a single tool call in a turn', () => {
    const turn = makeTurn({
      tool_calls: [
        makeToolCall({ name: 'send_email', arguments: { to: 'a@b.com', subject: 'Hi' } }),
      ],
    });
    const schemas = { send_email: sendEmailSchema };
    const result = validateTurn(turn, schemas);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('validates multiple tool calls in a turn', () => {
    const turn = makeTurn({
      tool_calls: [
        makeToolCall({ name: 'send_email', arguments: { to: 'a@b.com', subject: 'Hi' } }),
        makeToolCall({ name: 'search', arguments: { query: 'test' } }),
      ],
    });
    const schemas = { send_email: sendEmailSchema, search: searchSchema };
    const result = validateTurn(turn, schemas);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('accumulates issues from multiple tool calls', () => {
    const turn = makeTurn({
      tool_calls: [
        makeToolCall({ name: '', arguments: {} }),
        makeToolCall({ name: 'send_email', arguments: {} }),
      ],
    });
    const schemas = { send_email: sendEmailSchema };
    const result = validateTurn(turn, schemas);

    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.issues.some((i) => i.type === 'missing_tool_name')).toBe(true);
    expect(result.issues.some((i) => i.type === 'missing_required_param')).toBe(true);
  });

  it('includes turnId in issues', () => {
    const turn = makeTurn({
      turn_id: 5,
      tool_calls: [makeToolCall({ name: '', arguments: {} })],
    });
    const result = validateTurn(turn);

    expect(result.issues.every((i) => i.turnId === 5)).toBe(true);
  });

  it('reduces score based on issue severity', () => {
    const turn = makeTurn({
      tool_calls: [makeToolCall({ result: undefined })],
    });
    const schemas = { send_email: sendEmailSchema };
    const result = validateTurn(turn, schemas);

    expect(result.score).toBeLessThan(1.0);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('validateTrajectory', () => {
  it('returns empty results for trajectory with no agent tool calls', () => {
    const trajectory = makeTrajectory([
      makeTurn({ role: 'user', tool_calls: undefined }),
      makeTurn({ role: 'agent', tool_calls: undefined }),
    ]);
    const results = validateTrajectory(trajectory);

    expect(results).toHaveLength(0);
  });

  it('validates each agent turn with tool calls', () => {
    const trajectory = makeTrajectory([
      makeTurn({ turn_id: 1, role: 'user', content: 'reset password', tool_calls: undefined }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        tool_calls: [
          makeToolCall({ name: 'send_email', arguments: { to: 'a@b.com', subject: 'Reset' } }),
        ],
      }),
      makeTurn({ turn_id: 3, role: 'user', content: 'thanks', tool_calls: undefined }),
      makeTurn({
        turn_id: 4,
        role: 'agent',
        tool_calls: [makeToolCall({ name: 'search', arguments: { query: 'test' } })],
      }),
    ]);
    const schemas = { send_email: sendEmailSchema, search: searchSchema };
    const results = validateTrajectory(trajectory, schemas);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it('collects issues across all turns', () => {
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        tool_calls: [makeToolCall({ name: 'bad', arguments: {} })],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        tool_calls: [makeToolCall({ name: '', arguments: {} })],
      }),
    ]);
    const results = validateTrajectory(trajectory);

    expect(results).toHaveLength(2);
    expect(results[0]?.issues.some((i) => i.type === 'unknown_tool')).toBe(true);
    expect(results[1]?.issues.some((i) => i.type === 'missing_tool_name')).toBe(true);
  });

  it('passes schemas and options to each turn validation', () => {
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        tool_calls: [makeToolCall({ name: 'unknown', arguments: {} })],
      }),
    ]);
    const options: ValidateOptions = { allowUnknownTools: true };
    const results = validateTrajectory(trajectory, {}, options);

    expect(results[0]?.issues.some((i) => i.type === 'unknown_tool')).toBe(false);
  });
});
