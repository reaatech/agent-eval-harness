import type { LatencyResult } from './monitor.js';

/**
 * Latency budget configuration
 */
export interface LatencyBudget {
  /** P50 latency threshold (ms) */
  p50?: number;
  /** P90 latency threshold (ms) */
  p90?: number;
  /** P99 latency threshold (ms) */
  p99?: number;
  /** Maximum single turn latency (ms) */
  maxTurn?: number;
  /** Total trajectory latency threshold (ms) */
  total?: number;
  /** Per-component budgets */
  components?: ComponentBudget;
}

/**
 * Component-level latency budget
 */
export interface ComponentBudget {
  /** LLM call budget (ms) */
  llmCall?: number;
  /** Tool invocation budget (ms) */
  toolInvocation?: number;
  /** Overhead budget (ms) */
  overhead?: number;
}

/**
 * SLA violation
 */
export interface SLAViolation {
  type: ViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  actual: number;
  threshold: number;
  turnId?: number;
}

/**
 * Violation types
 */
export type ViolationType =
  | 'p50_exceeded'
  | 'p90_exceeded'
  | 'p99_exceeded'
  | 'max_turn_exceeded'
  | 'total_exceeded'
  | 'llm_call_exceeded'
  | 'tool_invocation_exceeded'
  | 'overhead_exceeded';

/**
 * Budget check result
 */
export interface BudgetEnforcementResult {
  /** Whether all budgets are within limits */
  passed: boolean;
  /** Violations found */
  violations: SLAViolation[];
  /** Warnings (approaching limits) */
  warnings: SLAViolation[];
  /** Score (0.0 to 1.0) */
  score: number;
}

/**
 * Enforce latency budgets
 */
export function enforceBudget(
  result: LatencyResult,
  budget: LatencyBudget,
): BudgetEnforcementResult {
  const violations: SLAViolation[] = [];
  const warnings: SLAViolation[] = [];

  // Check P50
  if (budget.p50 && result.p50Ms > budget.p50) {
    violations.push({
      type: 'p50_exceeded',
      severity: 'medium',
      description: `P50 latency (${result.p50Ms}ms) exceeds budget (${budget.p50}ms)`,
      actual: result.p50Ms,
      threshold: budget.p50,
    });
  } else if (budget.p50 && result.p50Ms > budget.p50 * 0.8) {
    warnings.push({
      type: 'p50_exceeded',
      severity: 'low',
      description: `P50 latency (${result.p50Ms}ms) approaching budget (${budget.p50}ms)`,
      actual: result.p50Ms,
      threshold: budget.p50,
    });
  }

  // Check P90
  if (budget.p90 && result.p90Ms > budget.p90) {
    violations.push({
      type: 'p90_exceeded',
      severity: 'high',
      description: `P90 latency (${result.p90Ms}ms) exceeds budget (${budget.p90}ms)`,
      actual: result.p90Ms,
      threshold: budget.p90,
    });
  } else if (budget.p90 && result.p90Ms > budget.p90 * 0.8) {
    warnings.push({
      type: 'p90_exceeded',
      severity: 'medium',
      description: `P90 latency (${result.p90Ms}ms) approaching budget (${budget.p90}ms)`,
      actual: result.p90Ms,
      threshold: budget.p90,
    });
  }

  // Check P99
  if (budget.p99 && result.p99Ms > budget.p99) {
    violations.push({
      type: 'p99_exceeded',
      severity: 'critical',
      description: `P99 latency (${result.p99Ms}ms) exceeds budget (${budget.p99}ms)`,
      actual: result.p99Ms,
      threshold: budget.p99,
    });
  } else if (budget.p99 && result.p99Ms > budget.p99 * 0.8) {
    warnings.push({
      type: 'p99_exceeded',
      severity: 'high',
      description: `P99 latency (${result.p99Ms}ms) approaching budget (${budget.p99}ms)`,
      actual: result.p99Ms,
      threshold: budget.p99,
    });
  }

  // Check max turn latency
  if (budget.maxTurn && result.maxLatencyMs > budget.maxTurn) {
    const offendingTurn = result.turns.find((t) => t.latencyMs === result.maxLatencyMs);
    violations.push({
      type: 'max_turn_exceeded',
      severity: 'high',
      description: `Max turn latency (${result.maxLatencyMs}ms) exceeds budget (${budget.maxTurn}ms)`,
      actual: result.maxLatencyMs,
      threshold: budget.maxTurn,
      ...(offendingTurn ? { turnId: offendingTurn.turnId } : {}),
    });
  }

  // Check total trajectory latency
  if (budget.total && result.totalLatencyMs > budget.total) {
    violations.push({
      type: 'total_exceeded',
      severity: 'high',
      description: `Total trajectory latency (${result.totalLatencyMs}ms) exceeds budget (${budget.total}ms)`,
      actual: result.totalLatencyMs,
      threshold: budget.total,
    });
  }

  // Check component budgets
  if (budget.components) {
    const componentViolations = checkComponentBudgets(result, budget.components);
    violations.push(...componentViolations);
  }

  // Calculate score
  const score = calculateEnforcementScore(violations, warnings);

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    score,
  };
}

/**
 * Check component-level budgets
 */
function checkComponentBudgets(result: LatencyResult, budget: ComponentBudget): SLAViolation[] {
  const violations: SLAViolation[] = [];

  // Calculate average component latencies
  const componentBreakdown = getAverageComponentLatency(result);

  if (budget.llmCall && componentBreakdown.avgLlmCall > budget.llmCall) {
    violations.push({
      type: 'llm_call_exceeded',
      severity: 'medium',
      description: `Avg LLM call latency (${componentBreakdown.avgLlmCall}ms) exceeds budget (${budget.llmCall}ms)`,
      actual: componentBreakdown.avgLlmCall,
      threshold: budget.llmCall,
    });
  }

  if (budget.toolInvocation && componentBreakdown.avgToolInvocation > budget.toolInvocation) {
    violations.push({
      type: 'tool_invocation_exceeded',
      severity: 'medium',
      description: `Avg tool invocation latency (${componentBreakdown.avgToolInvocation}ms) exceeds budget (${budget.toolInvocation}ms)`,
      actual: componentBreakdown.avgToolInvocation,
      threshold: budget.toolInvocation,
    });
  }

  if (budget.overhead && componentBreakdown.avgOverhead > budget.overhead) {
    violations.push({
      type: 'overhead_exceeded',
      severity: 'low',
      description: `Avg overhead (${componentBreakdown.avgOverhead}ms) exceeds budget (${budget.overhead}ms)`,
      actual: componentBreakdown.avgOverhead,
      threshold: budget.overhead,
    });
  }

  return violations;
}

/**
 * Get average component latency
 */
function getAverageComponentLatency(result: LatencyResult): {
  avgLlmCall: number;
  avgToolInvocation: number;
  avgOverhead: number;
} {
  const count = result.turns.length || 1;
  const totalLlmCall = result.turns.reduce((sum, t) => sum + (t.llmCallMs || 0), 0);
  const totalToolInvocation = result.turns.reduce((sum, t) => sum + (t.toolInvocationMs || 0), 0);
  const totalOverhead = result.turns.reduce((sum, t) => sum + (t.overheadMs || 0), 0);

  return {
    avgLlmCall: Math.round((totalLlmCall / count) * 100) / 100,
    avgToolInvocation: Math.round((totalToolInvocation / count) * 100) / 100,
    avgOverhead: Math.round((totalOverhead / count) * 100) / 100,
  };
}

/**
 * Calculate enforcement score
 */
function calculateEnforcementScore(violations: SLAViolation[], warnings: SLAViolation[]): number {
  if (violations.length === 0 && warnings.length === 0) return 1.0;

  const severityWeights: Record<string, number> = {
    critical: 0.4,
    high: 0.25,
    medium: 0.1,
    low: 0.05,
  };

  let deduction = 0;
  for (const v of violations) {
    deduction += severityWeights[v.severity] || 0.1;
  }
  for (const w of warnings) {
    deduction += (severityWeights[w.severity] ?? 0) * 0.5;
  }

  return Math.max(0, Math.round((1 - deduction) * 100) / 100);
}

/**
 * Create a latency budget from presets
 */
export function createLatencyBudget(preset: 'strict' | 'moderate' | 'lenient'): LatencyBudget {
  switch (preset) {
    case 'strict':
      return {
        p50: 500,
        p90: 1000,
        p99: 2000,
        maxTurn: 3000,
        total: 15000,
        components: {
          llmCall: 400,
          toolInvocation: 100,
          overhead: 50,
        },
      };
    case 'moderate':
      return {
        p50: 1000,
        p90: 2000,
        p99: 5000,
        maxTurn: 8000,
        total: 30000,
        components: {
          llmCall: 800,
          toolInvocation: 200,
          overhead: 100,
        },
      };
    case 'lenient':
      return {
        p50: 2000,
        p90: 4000,
        p99: 10000,
        maxTurn: 15000,
        total: 60000,
        components: {
          llmCall: 1500,
          toolInvocation: 500,
          overhead: 200,
        },
      };
    default:
      return {};
  }
}

/**
 * Format latency as human-readable string
 */
export function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    return `${(ms / 60000).toFixed(1)}m`;
  }
}
