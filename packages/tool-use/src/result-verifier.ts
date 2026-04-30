import type { ToolCall, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';

export interface ResultVerificationResult {
  valid: boolean;
  issues: ResultIssue[];
  score: number;
  hallucinated: boolean;
  integrated: boolean;
}

export interface ResultIssue {
  type: ResultIssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  turnId?: number;
  toolName?: string;
  details?: Record<string, unknown>;
}

export type ResultIssueType =
  | 'missing_result'
  | 'empty_result'
  | 'error_result'
  | 'hallucinated_content'
  | 'unused_result'
  | 'contradicts_response'
  | 'incomplete_integration'
  | 'malformed_result';

export interface VerifyOptions {
  checkUsage?: boolean;
  detectHallucination?: boolean;
  checkContradictions?: boolean;
  hallucinationThreshold?: number;
}

export function verifyResult(
  toolCall: ToolCall,
  turn: Turn,
  trajectory?: Trajectory,
  options: VerifyOptions = {},
): ResultVerificationResult {
  const {
    checkUsage = true,
    detectHallucination = true,
    checkContradictions: shouldCheckContradictions = true,
    hallucinationThreshold = 0.3,
  } = options;

  const issues: ResultIssue[] = [];

  if (!toolCall.result) {
    issues.push({
      type: 'missing_result',
      severity: 'medium',
      description: `Tool "${toolCall.name}" has no result`,
      turnId: turn.turn_id,
      toolName: toolCall.name,
    });
    return {
      valid: false,
      issues,
      score: 0.3,
      hallucinated: false,
      integrated: false,
    };
  }

  if (Object.keys(toolCall.result).length === 0) {
    issues.push({
      type: 'empty_result',
      severity: 'low',
      description: `Tool "${toolCall.name}" returned empty result`,
      turnId: turn.turn_id,
      toolName: toolCall.name,
    });
  }

  if (toolCall.result.status === 'error') {
    issues.push({
      type: 'error_result',
      severity: 'high',
      description: `Tool "${toolCall.name}" returned an error: ${toolCall.result.error || 'Unknown error'}`,
      turnId: turn.turn_id,
      toolName: toolCall.name,
      details: { error: toolCall.result.error },
    });
  }

  let hallucinated = false;
  if (detectHallucination) {
    const hallucinationScore = detectHallucinationIndicators(toolCall, turn, trajectory);
    hallucinated = hallucinationScore > hallucinationThreshold;

    if (hallucinated) {
      issues.push({
        type: 'hallucinated_content',
        severity: 'high',
        description: `Tool result from "${toolCall.name}" may contain hallucinated content`,
        turnId: turn.turn_id,
        toolName: toolCall.name,
        details: { hallucinationScore },
      });
    }
  }

  let integrated = false;
  if (checkUsage) {
    const usageResult = checkResultUsage(toolCall, turn, trajectory);
    integrated = usageResult.used;

    if (!usageResult.used) {
      issues.push({
        type: 'unused_result',
        severity: 'medium',
        description: `Result from "${toolCall.name}" does not appear to be used in response`,
        turnId: turn.turn_id,
        toolName: toolCall.name,
        details: { matchedFields: usageResult.matchedFields },
      });
    }
  }

  if (shouldCheckContradictions) {
    const contradictions = checkContradictions(toolCall, turn);
    if (contradictions.length > 0) {
      issues.push(...contradictions);
    }
  }

  const score = calculateResultScore(issues);

  return {
    valid: issues.filter((i) => i.severity === 'critical').length === 0,
    issues,
    score,
    hallucinated,
    integrated,
  };
}

function detectHallucinationIndicators(
  toolCall: ToolCall,
  turn: Turn,
  trajectory?: Trajectory,
): number {
  if (!toolCall.result) return 0;

  let hallucinationScore = 0;
  const responseContent = turn.content.toLowerCase();

  for (const [, value] of Object.entries(toolCall.result)) {
    if (typeof value === 'string' && value.length > 5) {
      const valueLower = value.toLowerCase();
      let found = responseContent.includes(valueLower);

      if (!found && trajectory) {
        found = trajectory.turns.some((t) => t.content.toLowerCase().includes(valueLower));
      }

      if (!found) {
        if (looksFabricated(value)) {
          hallucinationScore += 0.3;
        } else {
          hallucinationScore += 0.1;
        }
      }
    }

    if (typeof value === 'number') {
      if (value === 0 || value === 1 || value === 100) {
        hallucinationScore += 0.05;
      }
    }
  }

  return Math.min(1, hallucinationScore);
}

function looksFabricated(value: string): boolean {
  const patterns = [
    /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    /^[A-Z][a-z]+ \d{1,2}, \d{4}$/,
    /^\$\d+\.\d{2}$/,
    /^\d+%$/,
    /^ID: [A-Z0-9-]+$/,
    /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i,
  ];

  return patterns.some((pattern) => pattern.test(value));
}

function checkResultUsage(
  toolCall: ToolCall,
  turn: Turn,
  trajectory?: Trajectory,
): { used: boolean; matchedFields: string[] } {
  const matchedFields: string[] = [];

  if (!toolCall.result) {
    return { used: false, matchedFields: [] };
  }

  const responseContent = turn.content.toLowerCase();
  let anyMatch = false;

  for (const [key, value] of Object.entries(toolCall.result)) {
    if (value === null || value === undefined) continue;

    const stringValue = String(value).toLowerCase();
    if (stringValue.length < 3) continue;

    if (responseContent.includes(stringValue)) {
      matchedFields.push(key);
      anyMatch = true;
    }

    const keyWords = key
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 2);

    const keyMentioned = keyWords.some(
      (word) => responseContent.includes(word) || responseContent.includes(key.toLowerCase()),
    );

    if (keyMentioned && !matchedFields.includes(key)) {
      matchedFields.push(key);
      anyMatch = true;
    }
  }

  if (!anyMatch && trajectory) {
    const futureTurns = trajectory.turns.filter((t) => t.turn_id > turn.turn_id);

    for (const [key, value] of Object.entries(toolCall.result)) {
      if (value === null || value === undefined) continue;

      const stringValue = String(value).toLowerCase();
      if (stringValue.length < 3) continue;

      const foundInFuture = futureTurns.some((t) => t.content.toLowerCase().includes(stringValue));

      if (foundInFuture && !matchedFields.includes(key)) {
        matchedFields.push(key);
        anyMatch = true;
      }
    }
  }

  return { used: anyMatch, matchedFields };
}

function checkContradictions(toolCall: ToolCall, turn: Turn): ResultIssue[] {
  const issues: ResultIssue[] = [];

  if (!toolCall.result || !turn.content) return issues;

  const contradictions = [
    {
      resultPattern: /success|sent|created|updated/i,
      responsePattern: /failed|error|unable|could not|sorry/i,
      description: 'Result indicates success but response suggests failure',
    },
    {
      resultPattern: /not.?found|no.?result|empty/i,
      responsePattern: /found|here|this is/i,
      description: 'Result indicates not found but response suggests found',
    },
  ];

  const resultStr = JSON.stringify(toolCall.result);

  for (const contradiction of contradictions) {
    const resultMatches = contradiction.resultPattern.test(resultStr);
    const responseMatches = contradiction.responsePattern.test(turn.content);

    if (resultMatches && responseMatches) {
      issues.push({
        type: 'contradicts_response',
        severity: 'high',
        description: contradiction.description,
        turnId: turn.turn_id,
        toolName: toolCall.name,
        details: { result: resultStr.substring(0, 100), response: turn.content.substring(0, 100) },
      });
    }
  }

  return issues;
}

function calculateResultScore(issues: ResultIssue[]): number {
  if (issues.length === 0) return 1.0;

  const severityWeights: Record<string, number> = {
    critical: 1.0,
    high: 0.6,
    medium: 0.3,
    low: 0.1,
  };

  let totalDeduction = 0;
  for (const issue of issues) {
    totalDeduction += severityWeights[issue.severity] || 0.2;
  }

  return Math.max(0, 1 - totalDeduction);
}

export function verifyTurnResults(
  turn: Turn,
  trajectory?: Trajectory,
  options: VerifyOptions = {},
): ResultVerificationResult[] {
  const results: ResultVerificationResult[] = [];

  if (!turn.tool_calls) return results;

  for (const toolCall of turn.tool_calls) {
    const result = verifyResult(toolCall, turn, trajectory, options);
    results.push(result);
  }

  return results;
}

export function summarizeResultVerification(
  trajectory: Trajectory,
  options: VerifyOptions = {},
): {
  totalTools: number;
  validResults: number;
  hallucinatedResults: number;
  integratedResults: number;
  averageScore: number;
  issues: ResultIssue[];
} {
  const allResults: ResultVerificationResult[] = [];
  const allIssues: ResultIssue[] = [];

  for (const turn of trajectory.turns) {
    if (turn.role === 'agent' && turn.tool_calls) {
      for (const toolCall of turn.tool_calls) {
        const result = verifyResult(toolCall, turn, trajectory, options);
        allResults.push(result);
        allIssues.push(...result.issues);
      }
    }
  }

  return {
    totalTools: allResults.length,
    validResults: allResults.filter((r) => r.valid).length,
    hallucinatedResults: allResults.filter((r) => r.hallucinated).length,
    integratedResults: allResults.filter((r) => r.integrated).length,
    averageScore:
      allResults.length > 0
        ? allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length
        : 1,
    issues: allIssues,
  };
}
