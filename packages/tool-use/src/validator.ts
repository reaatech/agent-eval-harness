import type { ToolCall, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';

export interface ValidationResult {
  valid: boolean;
  issues: ToolUseIssue[];
  suggestions: string[];
  score: number;
}

export interface ToolUseIssue {
  type: ToolUseIssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  turnId?: number;
  toolName?: string;
  details?: Record<string, unknown>;
}

export type ToolUseIssueType =
  | 'missing_tool_name'
  | 'missing_arguments'
  | 'invalid_arguments'
  | 'tool_not_found'
  | 'tool_misuse'
  | 'missing_result'
  | 'result_unused'
  | 'hallucinated_result'
  | 'schema_violation'
  | 'type_mismatch'
  | 'missing_required_param'
  | 'unknown_tool'
  | 'deprecated_tool';

export interface ToolSchema {
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

export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: unknown[];
  format?: string;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
}

export interface ValidateOptions {
  allowUnknownTools?: boolean;
  validateSchemas?: boolean;
  checkResultUsage?: boolean;
  detectHallucination?: boolean;
  strict?: boolean;
}

export function validateTrajectory(
  trajectory: Trajectory,
  toolSchemas: Record<string, ToolSchema> = {},
  options: ValidateOptions = {},
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const turn of trajectory.turns) {
    if (turn.role === 'agent' && turn.tool_calls) {
      const result = validateTurn(turn, toolSchemas, options);
      results.push(result);
    }
  }

  return results;
}

export function validateTurn(
  turn: Turn,
  toolSchemas: Record<string, ToolSchema> = {},
  options: ValidateOptions = {},
): ValidationResult {
  const {
    allowUnknownTools = false,
    validateSchemas = true,
    checkResultUsage = true,
    detectHallucination = true,
    strict = false,
  } = options;

  const issues: ToolUseIssue[] = [];
  const suggestions: string[] = [];

  if (!turn.tool_calls || turn.tool_calls.length === 0) {
    return {
      valid: true,
      issues: [],
      suggestions: [],
      score: 1.0,
    };
  }

  for (const toolCall of turn.tool_calls) {
    if (!toolCall.name) {
      issues.push({
        type: 'missing_tool_name',
        severity: 'critical',
        description: 'Tool call is missing a name',
        turnId: turn.turn_id,
      });
      continue;
    }

    const schema = toolSchemas[toolCall.name];
    if (!schema) {
      if (!allowUnknownTools) {
        issues.push({
          type: 'unknown_tool',
          severity: strict ? 'high' : 'medium',
          description: `Unknown tool: "${toolCall.name}"`,
          turnId: turn.turn_id,
          toolName: toolCall.name,
        });
      }
    } else {
      if (schema.deprecated) {
        issues.push({
          type: 'deprecated_tool',
          severity: 'medium',
          description: `Tool "${toolCall.name}" is deprecated${schema.replacedBy ? `, use "${schema.replacedBy}" instead` : ''}`,
          turnId: turn.turn_id,
          toolName: toolCall.name,
          details: { replacedBy: schema.replacedBy },
        });
        suggestions.push(
          schema.replacedBy
            ? `Replace "${toolCall.name}" with "${schema.replacedBy}"`
            : `Find alternative to deprecated tool "${toolCall.name}"`,
        );
      }

      if (validateSchemas && schema) {
        const schemaIssues = validateArguments(toolCall, schema, turn.turn_id);
        issues.push(...schemaIssues);
      }
    }

    if (!toolCall.arguments) {
      issues.push({
        type: 'missing_arguments',
        severity: 'high',
        description: `Tool "${toolCall.name}" has no arguments`,
        turnId: turn.turn_id,
        toolName: toolCall.name,
      });
    }

    if (checkResultUsage && !toolCall.result) {
      issues.push({
        type: 'missing_result',
        severity: 'medium',
        description: `Tool "${toolCall.name}" was called but has no result`,
        turnId: turn.turn_id,
        toolName: toolCall.name,
      });
    }

    if (detectHallucination && toolCall.result) {
      const hallucinationIssues = checkForHallucination(toolCall, turn);
      issues.push(...hallucinationIssues);
    }
  }

  const score = calculateScore(issues, strict);

  return {
    valid: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
    suggestions,
    score,
  };
}

function validateArguments(toolCall: ToolCall, schema: ToolSchema, turnId: number): ToolUseIssue[] {
  const issues: ToolUseIssue[] = [];
  const params = schema.parameters;

  if (params.required) {
    for (const requiredParam of params.required) {
      if (!toolCall.arguments || !(requiredParam in toolCall.arguments)) {
        issues.push({
          type: 'missing_required_param',
          severity: 'high',
          description: `Missing required parameter "${requiredParam}" for tool "${toolCall.name}"`,
          turnId,
          toolName: toolCall.name,
          details: { parameter: requiredParam },
        });
      }
    }
  }

  if (toolCall.arguments && params.properties) {
    for (const [key, value] of Object.entries(toolCall.arguments)) {
      const paramSchema = params.properties[key];
      if (!paramSchema) continue;

      const typeIssue = validateParameterType(key, value, paramSchema, turnId, toolCall.name);
      if (typeIssue) {
        issues.push(typeIssue);
      }
    }
  }

  return issues;
}

function validateParameterType(
  name: string,
  value: unknown,
  schema: ParameterSchema,
  turnId: number,
  toolName: string,
): ToolUseIssue | null {
  const actualType = typeof value;
  const expectedType = schema.type;

  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    object: 'object',
    array: 'object',
  };

  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      return {
        type: 'type_mismatch',
        severity: 'high',
        description: `Parameter "${name}" expected array, got ${actualType}`,
        turnId,
        toolName,
        details: { parameter: name, expected: 'array', actual: actualType },
      };
    }
  } else if (typeMap[expectedType] && actualType !== typeMap[expectedType]) {
    return {
      type: 'type_mismatch',
      severity: 'high',
      description: `Parameter "${name}" expected ${expectedType}, got ${actualType}`,
      turnId,
      toolName,
      details: { parameter: name, expected: expectedType, actual: actualType },
    };
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return {
      type: 'invalid_arguments',
      severity: 'medium',
      description: `Parameter "${name}" value not in allowed values: ${JSON.stringify(schema.enum)}`,
      turnId,
      toolName,
      details: { parameter: name, value, allowed: schema.enum },
    };
  }

  return null;
}

function checkForHallucination(
  toolCall: ToolCall,
  turn: Turn,
  trajectory?: Trajectory,
): ToolUseIssue[] {
  const issues: ToolUseIssue[] = [];

  if (!toolCall.result) return issues;

  const responseContent = turn.content.toLowerCase();

  for (const [key, value] of Object.entries(toolCall.result)) {
    if (typeof value === 'string' && value.length > 3) {
      if (!responseContent.includes(value.toLowerCase())) {
        if (trajectory && trajectory.turns.length > 1) {
          const futureTurns = trajectory.turns.filter((t) => t.turn_id > turn.turn_id);
          const foundInFuture = futureTurns.some((t) =>
            t.content.toLowerCase().includes(value.toLowerCase()),
          );

          if (!foundInFuture) {
            issues.push({
              type: 'result_unused',
              severity: 'low',
              description: `Result field "${key}" from tool "${toolCall.name}" may not be used in response`,
              turnId: turn.turn_id,
              toolName: toolCall.name,
              details: { field: key },
            });
          }
        }
      }
    }
  }

  return issues;
}

function calculateScore(issues: ToolUseIssue[], strict: boolean): number {
  if (issues.length === 0) return 1.0;

  const severityWeights: Record<string, number> = {
    critical: 1.0,
    high: 0.7,
    medium: 0.4,
    low: 0.1,
  };

  let totalDeduction = 0;
  for (const issue of issues) {
    totalDeduction += severityWeights[issue.severity] || 0.2;
  }

  if (strict) {
    const hasHighOrCritical = issues.some(
      (i) => i.severity === 'high' || i.severity === 'critical',
    );
    if (hasHighOrCritical) return 0.0;
  }

  return Math.max(0, 1 - totalDeduction);
}

export function validateToolCall(
  toolCall: ToolCall,
  schema?: ToolSchema,
  options: ValidateOptions = {},
): ValidationResult {
  const turn: Turn = {
    turn_id: 0,
    role: 'agent',
    content: '',
    timestamp: new Date().toISOString(),
    tool_calls: [toolCall],
  };

  const schemas = schema ? { [toolCall.name]: schema } : {};
  return validateTurn(turn, schemas, options);
}
