import { describe, it, expect } from 'vitest';
import {
  validateTrajectory,
  validateTurn,
  validateToolCall,
} from '../../src/tool-use/validator.js';
import type { ToolSchema, ValidateOptions } from '../../src/tool-use/validator.js';
import { validateSchema, createToolSchema } from '../../src/tool-use/schema-checker.js';
import {
  verifyResult,
  verifyTurnResults,
  summarizeResultVerification,
} from '../../src/tool-use/result-verifier.js';
import type { VerifyOptions } from '../../src/tool-use/result-verifier.js';
import type { ToolCall, Turn, Trajectory } from '../../src/types/domain.js';

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
    expect(result.issues[0]!.severity).toBe('critical');
  });

  it('detects unknown tool when schema does not match', () => {
    const toolCall = makeToolCall({ name: 'nonexistent_tool' });
    const schemas: Record<string, ToolSchema> = { send_email: sendEmailSchema };
    const result = validateToolCall(
      toolCall,
      schemas['nonexistent_tool'] ? schemas['nonexistent_tool'] : undefined,
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
    expect(results[0]!.issues.some((i) => i.type === 'unknown_tool')).toBe(true);
    expect(results[1]!.issues.some((i) => i.type === 'missing_tool_name')).toBe(true);
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

    expect(results[0]!.issues.some((i) => i.type === 'unknown_tool')).toBe(false);
  });
});

describe('validateSchema (schema-checker)', () => {
  it('returns valid for matching arguments', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', limit: 10 },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(1.0);
  });

  it('returns critical issue when arguments are missing', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: undefined as unknown as Record<string, unknown>,
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]!.severity).toBe('critical');
    expect(result.issues[0]!.type).toBe('missing_arguments');
  });

  it('detects missing required fields', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { limit: 10 },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.type === 'required_field_missing')).toBe(true);
    expect(result.issues.some((i) => i.path === 'query')).toBe(true);
  });

  it('detects type errors for string fields', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 123 },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_error')).toBe(true);
    expect(result.issues.some((i) => i.expected === 'string')).toBe(true);
  });

  it('detects type errors for number fields', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', limit: 'not_a_number' },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_error')).toBe(true);
    expect(result.issues.some((i) => i.path === 'limit')).toBe(true);
  });

  it('detects type errors for boolean fields', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', include_metadata: 'yes' },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_error')).toBe(true);
  });

  it('detects invalid enum values', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', status: 'nonexistent' },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'invalid_enum_value')).toBe(true);
    expect(result.issues.some((i) => i.actual === 'nonexistent')).toBe(true);
  });

  it('accepts valid enum values', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', status: 'active' },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'invalid_enum_value')).toBe(false);
  });

  it('validates email format', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'not_an_email', subject: 'Test' },
    };
    const result = validateSchema(toolCall, sendEmailSchema);

    expect(result.issues.some((i) => i.type === 'invalid_format')).toBe(true);
  });

  it('accepts valid email format', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'user@example.com', subject: 'Test' },
    };
    const result = validateSchema(toolCall, sendEmailSchema);

    expect(result.issues.some((i) => i.type === 'invalid_format')).toBe(false);
  });

  it('validates nested objects', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', filters: { category: 'tech' } },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects type error when object expected but array given', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', filters: ['not', 'an', 'object'] },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_error')).toBe(true);
  });

  it('validates array items', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', tags: ['tag1', 'tag2'] },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects array type mismatch when non-array given', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', tags: 'not_array' },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'type_error' && i.expected === 'array')).toBe(true);
  });

  it('detects invalid items within arrays', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', tags: [123, 'valid'] },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.path === 'tags[0]' && i.type === 'type_error')).toBe(true);
  });

  it('allows unknown properties without error', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', extra_field: 'ignored' },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.path === 'extra_field')).toBe(false);
  });

  it('detects NaN number values', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test', limit: NaN },
    };
    const result = validateSchema(toolCall, searchSchema);

    expect(result.issues.some((i) => i.type === 'invalid_number')).toBe(true);
  });
});

describe('createToolSchema', () => {
  it('creates a schema from JSON Schema', () => {
    const schema = createToolSchema(
      'my_tool',
      {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name' },
          count: { type: 'number' },
        },
        required: ['name'],
      },
      'A test tool',
    );

    expect(schema.name).toBe('my_tool');
    expect(schema.description).toBe('A test tool');
    expect(schema.parameters.type).toBe('object');
    expect(schema.parameters.properties.name!.type).toBe('string');
    expect(schema.parameters.properties.name!.description).toBe('The name');
    expect(schema.parameters.properties.count!.type).toBe('number');
    expect(schema.parameters.required).toEqual(['name']);
  });

  it('creates a schema without description', () => {
    const schema = createToolSchema('tool', {
      type: 'object',
      properties: { query: { type: 'string' } },
    });

    expect(schema.name).toBe('tool');
    expect(schema.description).toBeUndefined();
    expect(schema.parameters.required).toBeUndefined();
  });

  it('creates a schema with enum and format', () => {
    const schema = createToolSchema('styled_tool', {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        status: { type: 'string', enum: ['on', 'off'] },
      },
    });

    expect(schema.parameters.properties.email!.format).toBe('email');
    expect(schema.parameters.properties.status!.enum).toEqual(['on', 'off']);
  });

  it('handles empty properties', () => {
    const schema = createToolSchema('empty', { properties: {} });

    expect(schema.parameters.properties).toEqual({});
    expect(schema.parameters.required).toBeUndefined();
  });

  it('handles missing properties field', () => {
    const schema = createToolSchema('no_props', {});

    expect(schema.parameters.properties).toEqual({});
  });
});

describe('verifyResult', () => {
  it('returns valid for a properly integrated result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72, unit: 'fahrenheit' },
    };
    const turn = makeTurn({
      content: 'The current temperature is 72 degrees fahrenheit.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.valid).toBe(true);
    expect(result.hallucinated).toBe(false);
    expect(result.integrated).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('detects missing result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
    };
    const turn = makeTurn({
      content: 'Let me check the weather.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing_result')).toBe(true);
    expect(result.integrated).toBe(false);
    expect(result.score).toBe(0.3);
  });

  it('detects empty result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: {},
    };
    const turn = makeTurn({
      content: 'Here is the weather info.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'empty_result')).toBe(true);
  });

  it('detects error result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { status: 'error', error: 'City not found' },
    };
    const turn = makeTurn({
      content: 'Sorry, I could not find weather data for that city.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'error_result')).toBe(true);
    expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
  });

  it('detects unused result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72, conditions: 'sunny and warm' },
    };
    const turn = makeTurn({
      content: 'I checked the weather.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'unused_result')).toBe(true);
    expect(result.integrated).toBe(false);
  });

  it('detects contradiction between result and response', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'a@b.com' },
      result: { status: 'sent', id: 'msg-1' },
    };
    const turn = makeTurn({
      content: 'Sorry, I failed to send the email. There was an error.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'contradicts_response')).toBe(true);
  });

  it('respects checkUsage option disabled', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72 },
    };
    const turn = makeTurn({
      content: 'I checked the weather.',
      tool_calls: [toolCall],
    });
    const options: VerifyOptions = { checkUsage: false };

    const result = verifyResult(toolCall, turn, undefined, options);

    expect(result.issues.some((i) => i.type === 'unused_result')).toBe(false);
  });

  it('respects detectHallucination option disabled', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72 },
    };
    const turn = makeTurn({
      content: 'The temperature is 85 degrees.',
      tool_calls: [toolCall],
    });
    const options: VerifyOptions = { detectHallucination: false };

    const result = verifyResult(toolCall, turn, undefined, options);

    expect(result.hallucinated).toBe(false);
    expect(result.issues.some((i) => i.type === 'hallucinated_content')).toBe(false);
  });

  it('respects checkContradictions option disabled', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'a@b.com' },
      result: { status: 'success' },
    };
    const turn = makeTurn({
      content: 'Failed to send email, error occurred.',
      tool_calls: [toolCall],
    });
    const options: VerifyOptions = { checkContradictions: false };

    const result = verifyResult(toolCall, turn, undefined, options);

    expect(result.issues.some((i) => i.type === 'contradicts_response')).toBe(false);
  });

  it('checks future turns for result usage via trajectory', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 'seventy two degrees', conditions: 'sunny and warm' },
    };
    const agentTurn = makeTurn({
      turn_id: 1,
      content: 'Let me check.',
      tool_calls: [toolCall],
    });
    const userTurn = makeTurn({
      turn_id: 2,
      role: 'user',
      content: 'What is it?',
      tool_calls: undefined,
    });
    const followUpTurn = makeTurn({
      turn_id: 3,
      content: 'The temperature is seventy two degrees.',
      tool_calls: undefined,
    });
    const trajectory = makeTrajectory([agentTurn, userTurn, followUpTurn]);

    const result = verifyResult(toolCall, agentTurn, trajectory);

    expect(result.integrated).toBe(true);
  });

  it('uses hallucinationThreshold option', () => {
    const toolCall: ToolCall = {
      name: 'get_data',
      arguments: {},
      result: { value: 'some_fabricated_data_string' },
    };
    const turn = makeTurn({
      content: 'Here is the data.',
      tool_calls: [toolCall],
    });

    const lowThreshold = verifyResult(toolCall, turn, undefined, { hallucinationThreshold: 0.0 });
    const highThreshold = verifyResult(toolCall, turn, undefined, { hallucinationThreshold: 1.0 });

    expect(lowThreshold.hallucinated).toBe(true);
    expect(highThreshold.hallucinated).toBe(false);
  });
});

describe('verifyTurnResults', () => {
  it('returns empty for turn with no tool calls', () => {
    const turn = makeTurn({ tool_calls: undefined });
    const results = verifyTurnResults(turn);

    expect(results).toHaveLength(0);
  });

  it('verifies each tool call in a turn', () => {
    const toolCall1: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { total_results: 'found 5 items' },
    };
    const toolCall2: ToolCall = {
      name: 'get_detail',
      arguments: { id: '123' },
      result: { name: 'Item 123' },
    };
    const turn = makeTurn({
      content: 'I found 5 items. The item name is Item 123.',
      tool_calls: [toolCall1, toolCall2],
    });

    const results = verifyTurnResults(turn);

    expect(results).toHaveLength(2);
    expect(results[0]!.integrated).toBe(true);
    expect(results[1]!.integrated).toBe(true);
  });

  it('passes trajectory and options to verifyResult', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { count: 5 },
    };
    const turn = makeTurn({
      content: '',
      tool_calls: [toolCall],
    });
    const trajectory = makeTrajectory([turn]);
    const options: VerifyOptions = { checkUsage: false };

    const results = verifyTurnResults(turn, trajectory, options);

    expect(results).toHaveLength(1);
    expect(results[0]!.issues.some((i) => i.type === 'unused_result')).toBe(false);
  });
});

describe('summarizeResultVerification', () => {
  it('returns zero counts for trajectory with no tool calls', () => {
    const trajectory = makeTrajectory([
      makeTurn({ role: 'user', tool_calls: undefined }),
      makeTurn({ role: 'agent', tool_calls: undefined }),
    ]);
    const summary = summarizeResultVerification(trajectory);

    expect(summary.totalTools).toBe(0);
    expect(summary.validResults).toBe(0);
    expect(summary.hallucinatedResults).toBe(0);
    expect(summary.integratedResults).toBe(0);
    expect(summary.averageScore).toBe(1);
    expect(summary.issues).toHaveLength(0);
  });

  it('summarizes results across all turns', () => {
    const toolCall1: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { total_results: 'found 5 items' },
    };
    const toolCall2: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 'seventy two degrees' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        content: 'I found 5 items.',
        tool_calls: [toolCall1],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        content: 'The temperature is seventy two degrees.',
        tool_calls: [toolCall2],
      }),
    ]);

    const summary = summarizeResultVerification(trajectory);

    expect(summary.totalTools).toBe(2);
    expect(summary.validResults).toBe(2);
    expect(summary.hallucinatedResults).toBe(0);
    expect(summary.integratedResults).toBe(2);
    expect(summary.averageScore).toBe(1.0);
    expect(summary.issues).toHaveLength(0);
  });

  it('counts hallucinated and unintegrated results', () => {
    const toolCall1: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { data: 'some_long_fabricated_value' },
    };
    const toolCall2: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        content: 'Here are results.',
        tool_calls: [toolCall1],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        content: 'I checked the weather.',
        tool_calls: [toolCall2],
      }),
    ]);

    const summary = summarizeResultVerification(trajectory);

    expect(summary.totalTools).toBe(2);
    expect(summary.issues.length).toBeGreaterThan(0);
  });

  it('passes options through to verifyResult', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        role: 'agent',
        content: '',
        tool_calls: [toolCall],
      }),
    ]);
    const options: VerifyOptions = { detectHallucination: false, checkUsage: false };

    const summary = summarizeResultVerification(trajectory, options);

    expect(summary.issues.some((i) => i.type === 'hallucinated_content')).toBe(false);
    expect(summary.issues.some((i) => i.type === 'unused_result')).toBe(false);
  });

  it('calculates average score correctly', () => {
    const toolCall1: ToolCall = {
      name: 'tool_a',
      arguments: {},
      result: { status: 'sent' },
    };
    const toolCall2: ToolCall = {
      name: 'tool_b',
      arguments: {},
      result: { status: 'sent' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        content: 'Done and done.',
        tool_calls: [toolCall1],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        content: 'Also done.',
        tool_calls: [toolCall2],
      }),
    ]);

    const summary = summarizeResultVerification(trajectory);

    expect(summary.averageScore).toBeGreaterThanOrEqual(0);
    expect(summary.averageScore).toBeLessThanOrEqual(1);
  });
});
