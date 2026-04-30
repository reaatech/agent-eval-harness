import type { CostBreakdown, Trajectory } from '@reaatech/agent-eval-harness-types';

export interface BudgetConfig {
  perTask?: number;
  perTrajectory?: number;
  daily?: number;
  perToolCall?: number;
}

export interface AlertThreshold {
  threshold: number;
  action: 'log' | 'warn' | 'block';
  message?: string;
}

export interface BudgetCheckResult {
  withinBudget: boolean;
  currentCost: number;
  budgetLimit: number;
  usagePercentage: number;
  alerts: BudgetAlert[];
  recommendations: string[];
}

export interface BudgetAlert {
  level: 'info' | 'warning' | 'error';
  message: string;
  threshold: number;
  current: number;
  action: 'log' | 'warn' | 'block';
}

export function checkBudget(
  cost: CostBreakdown,
  budget: BudgetConfig,
  thresholds: AlertThreshold[] = DEFAULT_THRESHOLDS,
): BudgetCheckResult {
  const alerts: BudgetAlert[] = [];
  const recommendations: string[] = [];
  const currentCost = cost.total_cost;

  if (budget.perTrajectory !== undefined) {
    const usage = currentCost / budget.perTrajectory;
    const withinBudget = usage <= 1;

    if (!withinBudget) {
      alerts.push({
        level: 'error',
        message: `Trajectory cost ($${currentCost.toFixed(4)}) exceeds budget ($${budget.perTrajectory.toFixed(4)})`,
        threshold: budget.perTrajectory,
        current: currentCost,
        action: 'block',
      });
      recommendations.push('Consider using a cheaper model or reducing prompt length');
    }

    for (const { threshold, action, message } of thresholds) {
      if (usage >= threshold) {
        alerts.push({
          level: threshold >= 0.9 ? 'error' : threshold >= 0.75 ? 'warning' : 'info',
          message:
            message ||
            `Budget usage at ${(usage * 100).toFixed(1)}% ($${currentCost.toFixed(4)} of $${budget.perTrajectory.toFixed(4)})`,
          threshold,
          current: usage,
          action,
        });
      }
    }

    return {
      withinBudget,
      currentCost,
      budgetLimit: budget.perTrajectory,
      usagePercentage: Math.round(usage * 10000) / 100,
      alerts,
      recommendations,
    };
  }

  if (budget.perTask !== undefined && cost.per_turn) {
    let withinBudget = true;
    for (const turnCost of cost.per_turn) {
      const tc = turnCost.total_cost ?? turnCost.cost;
      if (tc > budget.perTask) {
        withinBudget = false;
        alerts.push({
          level: 'error',
          message: `Turn ${turnCost.turn_id} cost ($${tc.toFixed(4)}) exceeds per-task budget ($${budget.perTask.toFixed(4)})`,
          threshold: budget.perTask,
          current: tc,
          action: 'block',
        });
      }
    }

    return {
      withinBudget,
      currentCost,
      budgetLimit: budget.perTask,
      usagePercentage: 0,
      alerts,
      recommendations,
    };
  }

  return {
    withinBudget: true,
    currentCost,
    budgetLimit: 0,
    usagePercentage: 0,
    alerts: [],
    recommendations: [],
  };
}

export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { threshold: 0.5, action: 'log', message: 'Budget 50% used' },
  { threshold: 0.75, action: 'warn', message: 'Budget 75% used' },
  { threshold: 0.9, action: 'block', message: 'Budget 90% used - approaching limit' },
];

export function getOptimizationRecommendations(
  cost: CostBreakdown,
  trajectory: Trajectory,
): string[] {
  const recommendations: string[] = [];

  const inputTokens = cost.input_tokens ?? 0;
  const outputTokens = cost.output_tokens ?? 0;
  if (inputTokens > 0 && outputTokens > 0) {
    const ratio = outputTokens / inputTokens;
    if (ratio > 3) {
      recommendations.push(
        'High output/input token ratio. Consider prompting for more concise responses.',
      );
    }
  }

  const toolCost = cost.tool_cost ?? 0;
  if (toolCost > 0) {
    const toolCostRatio = toolCost / cost.total_cost;
    if (toolCostRatio > 0.3) {
      recommendations.push(
        'Tool invocation costs are significant. Consider batching tool calls or using cheaper tools.',
      );
    }
  }

  if (cost.per_turn) {
    const avgCost =
      cost.per_turn.reduce((sum, tc) => sum + (tc.total_cost ?? tc.cost), 0) / cost.per_turn.length;
    const expensiveTurns = cost.per_turn.filter((tc) => (tc.total_cost ?? tc.cost) > avgCost * 2);

    if (expensiveTurns.length > 0) {
      recommendations.push(
        `${expensiveTurns.length} turn(s) cost more than 2x the average. Review these turns for optimization opportunities.`,
      );
    }
  }

  const agentTurns = trajectory.turns.filter((t) => t.role === 'agent').length;
  if (agentTurns > 10) {
    recommendations.push(
      'Long conversation detected. Consider implementing better task decomposition or early termination.',
    );
  }

  return recommendations;
}

export function createBudget(preset: 'strict' | 'moderate' | 'lenient'): BudgetConfig {
  switch (preset) {
    case 'strict':
      return {
        perTask: 0.01,
        perTrajectory: 0.5,
        daily: 10.0,
        perToolCall: 0.001,
      };
    case 'moderate':
      return {
        perTask: 0.05,
        perTrajectory: 1.0,
        daily: 50.0,
        perToolCall: 0.005,
      };
    case 'lenient':
      return {
        perTask: 0.1,
        perTrajectory: 5.0,
        daily: 100.0,
        perToolCall: 0.01,
      };
    default:
      return {};
  }
}

export class CostTracker {
  private totalCost = 0;
  private trajectoryCount = 0;
  private dailyBudget?: number;
  private alerts: BudgetAlert[] = [];

  constructor(dailyBudget?: number) {
    if (dailyBudget !== undefined) {
      this.dailyBudget = dailyBudget;
    }
  }

  addTrajectory(cost: CostBreakdown): BudgetCheckResult {
    this.totalCost += cost.total_cost;
    this.trajectoryCount++;

    if (this.dailyBudget) {
      const usage = this.totalCost / this.dailyBudget;

      if (usage >= 0.9) {
        this.alerts.push({
          level: 'error',
          message: `Daily budget at ${(usage * 100).toFixed(1)}% ($${this.totalCost.toFixed(4)} of $${this.dailyBudget.toFixed(2)})`,
          threshold: 0.9,
          current: usage,
          action: 'block',
        });
      } else if (usage >= 0.75) {
        this.alerts.push({
          level: 'warning',
          message: `Daily budget at ${(usage * 100).toFixed(1)}% ($${this.totalCost.toFixed(4)} of $${this.dailyBudget.toFixed(2)})`,
          threshold: 0.75,
          current: usage,
          action: 'warn',
        });
      }
    }

    return {
      withinBudget: !this.dailyBudget || this.totalCost <= this.dailyBudget,
      currentCost: this.totalCost,
      budgetLimit: this.dailyBudget || 0,
      usagePercentage: this.dailyBudget
        ? Math.round((this.totalCost / this.dailyBudget) * 10000) / 100
        : 0,
      alerts: this.alerts,
      recommendations: [],
    };
  }

  getTotalCost(): number {
    return Math.round(this.totalCost * 10000) / 10000;
  }

  getTrajectoryCount(): number {
    return this.trajectoryCount;
  }

  reset(): void {
    this.totalCost = 0;
    this.trajectoryCount = 0;
    this.alerts = [];
  }
}
