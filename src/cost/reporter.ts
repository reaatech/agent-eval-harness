import type { CostBreakdown, Trajectory } from '../types/domain.js';

/**
 * Cost report data
 */
export interface CostReport {
  /** Report generation timestamp */
  generatedAt: string;
  /** Total cost across all trajectories */
  totalCost: number;
  /** Number of trajectories analyzed */
  trajectoryCount: number;
  /** Average cost per trajectory */
  avgCostPerTrajectory: number;
  /** Cost breakdown by component */
  breakdown: CostComponentBreakdown;
  /** Per-trajectory costs */
  perTrajectory: TrajectoryCostEntry[];
  /** Trends over time */
  trends?: CostTrend[];
  /** Top expensive operations */
  topExpensive: ExpensiveOperation[];
}

/**
 * Cost component breakdown
 */
export interface CostComponentBreakdown {
  llmCalls: number;
  toolInvocations: number;
  judgeEvaluations?: number;
}

/**
 * Per-trajectory cost entry
 */
export interface TrajectoryCostEntry {
  trajectoryId: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
  timestamp?: string;
}

/**
 * Cost trend data point
 */
export interface CostTrend {
  timestamp: string;
  cost: number;
  trajectoryCount: number;
  avgCost: number;
}

/**
 * Expensive operation
 */
export interface ExpensiveOperation {
  type: 'turn' | 'tool_call' | 'trajectory';
  id: string | number;
  cost: number;
  details?: string;
}

/**
 * Generate a comprehensive cost report
 */
export function generateCostReport(
  trajectories: Array<{ trajectory: Trajectory; cost: CostBreakdown }>,
  options: CostReportOptions = {},
): CostReport {
  const { includeTrends = true, topN = 10 } = options;

  const totalCost = trajectories.reduce((sum, t) => sum + t.cost.total_cost, 0);
  const avgCostPerTrajectory = trajectories.length > 0 ? totalCost / trajectories.length : 0;

  // Component breakdown
  const breakdown: CostComponentBreakdown = {
    llmCalls: trajectories.reduce(
      (sum, t) => sum + (t.cost.llm_cost ?? t.cost.breakdown?.llm_calls ?? 0),
      0,
    ),
    toolInvocations: trajectories.reduce(
      (sum, t) => sum + (t.cost.tool_cost ?? t.cost.breakdown?.tool_invocations ?? 0),
      0,
    ),
  };

  // Per-trajectory costs
  const perTrajectory: TrajectoryCostEntry[] = trajectories.map((t) => ({
    trajectoryId: t.trajectory.trajectory_id ?? 'unknown',
    totalCost: t.cost.total_cost,
    inputTokens: t.cost.input_tokens ?? 0,
    outputTokens: t.cost.output_tokens ?? 0,
    turnCount: t.trajectory.turns.filter((turn) => turn.role === 'agent').length,
    ...(t.trajectory.metadata?.start_time ? { timestamp: t.trajectory.metadata.start_time } : {}),
  }));

  // Trends
  let trends: CostTrend[] | undefined;
  if (includeTrends && perTrajectory.length > 1) {
    trends = calculateTrends(perTrajectory);
  }

  // Top expensive operations
  const topExpensive = findTopExpensive(trajectories, topN);

  return {
    generatedAt: new Date().toISOString(),
    totalCost: Math.round(totalCost * 10000) / 10000,
    trajectoryCount: trajectories.length,
    avgCostPerTrajectory: Math.round(avgCostPerTrajectory * 10000) / 10000,
    breakdown,
    perTrajectory,
    ...(trends ? { trends } : {}),
    topExpensive,
  };
}

/**
 * Options for cost report generation
 */
export interface CostReportOptions {
  includeTrends?: boolean;
  topN?: number;
}

/**
 * Calculate cost trends
 */
function calculateTrends(entries: TrajectoryCostEntry[]): CostTrend[] {
  // Group by hour for trends
  const hourlyGroups = new Map<string, TrajectoryCostEntry[]>();

  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const hour = entry.timestamp.substring(0, 13); // YYYY-MM-DDTHH
    if (!hourlyGroups.has(hour)) {
      hourlyGroups.set(hour, []);
    }
    hourlyGroups.get(hour)?.push(entry);
  }

  const trends: CostTrend[] = [];
  for (const [hour, group] of hourlyGroups) {
    const totalCost = group.reduce((sum, e) => sum + e.totalCost, 0);
    trends.push({
      timestamp: `${hour}:00:00Z`,
      cost: Math.round(totalCost * 10000) / 10000,
      trajectoryCount: group.length,
      avgCost: Math.round((totalCost / group.length) * 10000) / 10000,
    });
  }

  return trends.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Find top expensive operations
 */
function findTopExpensive(
  trajectories: Array<{ trajectory: Trajectory; cost: CostBreakdown }>,
  topN: number,
): ExpensiveOperation[] {
  const operations: ExpensiveOperation[] = [];

  for (const { trajectory, cost } of trajectories) {
    // Add trajectory-level costs
    operations.push({
      type: 'trajectory',
      id: trajectory.trajectory_id || 'unknown',
      cost: cost.total_cost,
      details: `${trajectory.turns.length} turns`,
    });

    // Add turn-level costs
    if (cost.per_turn) {
      for (const turnCost of cost.per_turn) {
        operations.push({
          type: 'turn',
          id: `${trajectory.trajectory_id ?? 'unknown'}-turn-${turnCost.turn_id}`,
          cost: turnCost.total_cost ?? turnCost.cost,
          details: `Turn ${turnCost.turn_id}`,
        });
      }
    }
  }

  return operations.sort((a, b) => b.cost - a.cost).slice(0, topN);
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(cost);
}

/**
 * Export cost report to CSV format
 */
export function exportToCsv(report: CostReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Metric,Value');
  lines.push(`Total Cost,${report.totalCost}`);
  lines.push(`Trajectory Count,${report.trajectoryCount}`);
  lines.push(`Avg Cost Per Trajectory,${report.avgCostPerTrajectory}`);
  lines.push(`LLM Calls Cost,${report.breakdown.llmCalls}`);
  lines.push(`Tool Invocations Cost,${report.breakdown.toolInvocations}`);
  lines.push('');

  // Per-trajectory costs
  lines.push('Trajectory ID,Total Cost,Input Tokens,Output Tokens,Turn Count,Timestamp');
  for (const entry of report.perTrajectory) {
    lines.push(
      `${entry.trajectoryId},${entry.totalCost},${entry.inputTokens},${entry.outputTokens},${entry.turnCount},${entry.timestamp || ''}`,
    );
  }

  return lines.join('\n');
}

/**
 * Export cost report to JSON format
 */
export function exportToJson(report: CostReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Generate a summary string for console output
 */
export function generateSummary(report: CostReport): string {
  const lines: string[] = [
    '',
    '=== Cost Report ===',
    `Total Cost: ${formatCost(report.totalCost)}`,
    `Trajectories: ${report.trajectoryCount}`,
    `Avg per Trajectory: ${formatCost(report.avgCostPerTrajectory)}`,
    '',
    'Breakdown:',
    `  LLM Calls: ${formatCost(report.breakdown.llmCalls)}`,
    `  Tool Invocations: ${formatCost(report.breakdown.toolInvocations)}`,
    '',
    'Top Expensive:',
  ];

  for (const op of report.topExpensive.slice(0, 5)) {
    lines.push(`  ${op.type} ${op.id}: ${formatCost(op.cost)}`);
  }

  return lines.join('\n');
}
