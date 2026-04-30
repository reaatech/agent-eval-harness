import type { ToolCall } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import { createToolSchema, validateSchema } from './schema-checker.js';
import type { ToolSchema } from './validator.js';

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
    expect(result.issues[0]?.severity).toBe('critical');
    expect(result.issues[0]?.type).toBe('missing_arguments');
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
      arguments: { query: 'test', limit: Number.NaN },
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
    expect(schema.parameters.properties.name?.type).toBe('string');
    expect(schema.parameters.properties.name?.description).toBe('The name');
    expect(schema.parameters.properties.count?.type).toBe('number');
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

    expect(schema.parameters.properties.email?.format).toBe('email');
    expect(schema.parameters.properties.status?.enum).toEqual(['on', 'off']);
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
