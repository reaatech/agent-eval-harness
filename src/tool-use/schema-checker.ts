import type { ToolCall } from '../types/domain.js';
import type { ParameterSchema, ToolSchema } from './validator.js';

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaIssue[];
  score: number;
}

/**
 * Schema-specific issue
 */
export interface SchemaIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/**
 * Validate tool arguments against a JSON schema
 */
export function validateSchema(toolCall: ToolCall, schema: ToolSchema): SchemaValidationResult {
  const issues: SchemaIssue[] = [];

  if (!toolCall.arguments) {
    issues.push({
      type: 'missing_arguments',
      severity: 'critical',
      path: '',
      message: 'No arguments provided',
    });
    return { valid: false, issues, score: 0 };
  }

  // Validate against parameters schema
  const paramIssues = validateParameters(toolCall.arguments, schema.parameters, '');
  issues.push(...paramIssues);

  const valid = issues.filter((i) => i.severity === 'critical').length === 0;
  const score = calculateSchemaScore(issues);

  return { valid, issues, score };
}

/**
 * Validate parameters recursively
 */
function validateParameters(
  args: Record<string, unknown>,
  params: ToolSchema['parameters'],
  basePath: string,
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  // Check required fields
  if (params.required) {
    for (const requiredField of params.required) {
      if (!(requiredField in args)) {
        issues.push({
          type: 'required_field_missing',
          severity: 'high',
          path: basePath ? `${basePath}.${requiredField}` : requiredField,
          message: `Required field "${requiredField}" is missing`,
        });
      }
    }
  }

  // Validate each property
  if (params.properties) {
    for (const [key, value] of Object.entries(args)) {
      const paramSchema = params.properties[key];
      const path = basePath ? `${basePath}.${key}` : key;

      if (!paramSchema) {
        // Unknown property - could be allowed or not depending on additionalProperties
        continue;
      }

      const valueIssues = validateValue(value, paramSchema, path);
      issues.push(...valueIssues);
    }
  }

  return issues;
}

/**
 * Validate a single value against its schema
 */
function validateValue(value: unknown, schema: ParameterSchema, path: string): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  // Type check
  const typeIssues = validateType(value, schema, path);
  issues.push(...typeIssues);

  // Enum check
  if (schema.enum && !issues.length) {
    if (!schema.enum.includes(value)) {
      issues.push({
        type: 'invalid_enum_value',
        severity: 'high',
        path,
        message: `Value must be one of: ${JSON.stringify(schema.enum)}`,
        expected: schema.enum,
        actual: value,
      });
    }
  }

  // Format check
  if (schema.format && typeof value === 'string') {
    const formatIssue = validateFormat(value, schema.format, path);
    if (formatIssue) issues.push(formatIssue);
  }

  // Nested object check
  if (
    schema.type === 'object' &&
    schema.properties &&
    typeof value === 'object' &&
    value !== null
  ) {
    const nestedIssues = validateParameters(
      value as Record<string, unknown>,
      { type: 'object', properties: schema.properties },
      path,
    );
    issues.push(...nestedIssues);
  }

  // Array items check
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const itemIssues = validateValue(value[i], schema.items, `${path}[${i}]`);
      issues.push(...itemIssues);
    }
  }

  return issues;
}

/**
 * Validate value type
 */
function validateType(value: unknown, schema: ParameterSchema, path: string): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const expectedType = schema.type;

  switch (expectedType) {
    case 'string':
      if (typeof value !== 'string') {
        issues.push({
          type: 'type_error',
          severity: 'high',
          path,
          message: `Expected string, got ${typeof value}`,
          expected: 'string',
          actual: typeof value,
        });
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        issues.push({
          type: 'type_error',
          severity: 'high',
          path,
          message: `Expected number, got ${typeof value}`,
          expected: 'number',
          actual: typeof value,
        });
      } else if (Number.isNaN(value)) {
        issues.push({
          type: 'invalid_number',
          severity: 'high',
          path,
          message: 'Value is NaN',
          actual: value,
        });
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        issues.push({
          type: 'type_error',
          severity: 'high',
          path,
          message: `Expected boolean, got ${typeof value}`,
          expected: 'boolean',
          actual: typeof value,
        });
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        issues.push({
          type: 'type_error',
          severity: 'high',
          path,
          message: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`,
          expected: 'object',
          actual: Array.isArray(value) ? 'array' : typeof value,
        });
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        issues.push({
          type: 'type_error',
          severity: 'high',
          path,
          message: `Expected array, got ${typeof value}`,
          expected: 'array',
          actual: typeof value,
        });
      }
      break;
  }

  return issues;
}

/**
 * Validate string format
 */
function validateFormat(value: string, format: string, path: string): SchemaIssue | null {
  switch (format) {
    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return {
          type: 'invalid_format',
          severity: 'medium',
          path,
          message: 'Invalid email format',
          expected: 'email',
          actual: value,
        };
      }
      break;
    }

    case 'uri':
      try {
        new URL(value);
      } catch {
        return {
          type: 'invalid_format',
          severity: 'medium',
          path,
          message: 'Invalid URI format',
          expected: 'uri',
          actual: value,
        };
      }
      break;

    case 'date': {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return {
          type: 'invalid_format',
          severity: 'medium',
          path,
          message: 'Invalid date format (expected YYYY-MM-DD)',
          expected: 'date',
          actual: value,
        };
      }
      break;
    }

    case 'date-time': {
      const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      if (!dateTimeRegex.test(value)) {
        return {
          type: 'invalid_format',
          severity: 'medium',
          path,
          message: 'Invalid date-time format (expected ISO 8601)',
          expected: 'date-time',
          actual: value,
        };
      }
      break;
    }
  }

  return null;
}

/**
 * Calculate schema validation score
 */
function calculateSchemaScore(issues: SchemaIssue[]): number {
  if (issues.length === 0) return 1.0;

  const severityWeights: Record<string, number> = {
    critical: 1.0,
    high: 0.5,
    medium: 0.2,
    low: 0.05,
  };

  let totalDeduction = 0;
  for (const issue of issues) {
    totalDeduction += severityWeights[issue.severity] || 0.1;
  }

  return Math.max(0, 1 - totalDeduction);
}

/**
 * Create a tool schema from JSON Schema
 */
export function createToolSchema(
  name: string,
  jsonSchema: Record<string, unknown>,
  description?: string,
): ToolSchema {
  return {
    name,
    ...(description !== undefined ? { description } : {}),
    parameters: {
      type: 'object',
      properties: convertProperties((jsonSchema.properties as Record<string, unknown>) ?? {}),
      ...(Array.isArray(jsonSchema.required) ? { required: jsonSchema.required as string[] } : {}),
    },
  };
}

/**
 * Convert JSON Schema properties to ParameterSchema
 */
function convertProperties(properties: Record<string, unknown>): Record<string, ParameterSchema> {
  const result: Record<string, ParameterSchema> = {};

  for (const [key, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;
    result[key] = {
      type: (prop.type as ParameterSchema['type']) || 'string',
      description: prop.description as string,
      enum: prop.enum as unknown[],
      format: prop.format as string,
    };
  }

  return result;
}
