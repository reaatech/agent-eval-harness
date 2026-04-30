import type { JudgeProvider } from './engine.js';

/**
 * Provider pricing configuration (per million tokens)
 */
export interface ProviderPricing {
  input: number;
  output: number;
}

/**
 * Cost tracking configuration
 */
export interface JudgeCostConfig {
  /** Budget limit for judge operations */
  budgetLimit?: number;
  /** Maximum cost per judgment */
  maxCostPerJudgment?: number;
  /** Alert thresholds */
  alertThresholds?: number[];
  /** Pricing per provider */
  pricing?: Record<JudgeProvider, ProviderPricing>;
}

/**
 * Per-judgment cost record
 */
export interface JudgmentCost {
  /** Judgment ID */
  judgmentId: string;
  /** Provider used */
  provider: JudgeProvider;
  /** Model used */
  model: string;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Cost in USD */
  cost: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Cost alert
 */
export interface CostAlert {
  /** Alert level */
  level: 'info' | 'warning' | 'error';
  /** Alert message */
  message: string;
  /** Current budget usage percentage */
  usagePercentage: number;
  /** Threshold that triggered alert */
  threshold: number;
}

/**
 * Cost breakdown
 */
export interface JudgeCostBreakdown {
  /** Total cost */
  totalCost: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Number of judgments */
  judgmentCount: number;
  /** Average cost per judgment */
  avgCostPerJudgment: number;
  /** Cost by provider */
  costByProvider: Record<string, number>;
  /** Budget usage percentage */
  budgetUsagePercentage: number;
}

/**
 * Default pricing (per million tokens)
 */
const DEFAULT_PRICING: Record<JudgeProvider, ProviderPricing> = {
  claude: { input: 15.0, output: 75.0 },
  gpt4: { input: 10.0, output: 30.0 },
  gemini: { input: 2.5, output: 7.5 },
  openrouter: { input: 5.0, output: 15.0 },
};

/**
 * Default alert thresholds
 */
const DEFAULT_ALERT_THRESHOLDS = [0.5, 0.75, 0.9];

/**
 * Judge Cost Tracker
 */
export class JudgeCostTracker {
  private config: JudgeCostConfig;
  private pricing: Record<JudgeProvider, ProviderPricing>;
  private judgments: JudgmentCost[] = [];
  private totalCost = 0;
  private alertsTriggered = new Set<number>();

  constructor(config: JudgeCostConfig = {}) {
    this.config = config;
    this.pricing = config.pricing || DEFAULT_PRICING;
  }

  /**
   * Record a judgment cost
   */
  recordJudgment(
    judgmentId: string,
    provider: JudgeProvider,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): { cost: number; alerts: CostAlert[] } {
    const providerPricing = this.pricing[provider] || DEFAULT_PRICING.claude;
    const cost =
      (inputTokens * providerPricing.input + outputTokens * providerPricing.output) / 1_000_000;

    const judgment: JudgmentCost = {
      judgmentId,
      provider,
      model,
      inputTokens,
      outputTokens,
      cost: Math.round(cost * 10000) / 10000,
      timestamp: new Date().toISOString(),
    };

    this.judgments.push(judgment);
    this.totalCost += cost;

    // Check max cost per judgment
    const alerts: CostAlert[] = [];
    if (this.config.maxCostPerJudgment && cost > this.config.maxCostPerJudgment) {
      alerts.push({
        level: 'warning',
        message: `Judgment cost ($${cost.toFixed(4)}) exceeds max ($${this.config.maxCostPerJudgment.toFixed(4)})`,
        usagePercentage: 0,
        threshold: this.config.maxCostPerJudgment,
      });
    }

    // Check budget thresholds
    if (this.config.budgetLimit) {
      const usage = this.totalCost / this.config.budgetLimit;
      for (const threshold of this.config.alertThresholds || DEFAULT_ALERT_THRESHOLDS) {
        if (usage >= threshold && !this.alertsTriggered.has(Math.round(threshold * 100))) {
          this.alertsTriggered.add(Math.round(threshold * 100));
          alerts.push({
            level: threshold >= 0.9 ? 'error' : threshold >= 0.75 ? 'warning' : 'info',
            message: `Judge budget at ${(usage * 100).toFixed(1)}% ($${this.totalCost.toFixed(4)} of $${this.config.budgetLimit.toFixed(2)})`,
            usagePercentage: Math.round(usage * 10000) / 100,
            threshold,
          });
        }
      }

      // Check if budget exceeded
      if (usage >= 1) {
        alerts.push({
          level: 'error',
          message: `Judge budget exceeded: $${this.totalCost.toFixed(4)} of $${this.config.budgetLimit.toFixed(2)}`,
          usagePercentage: Math.round(usage * 10000) / 100,
          threshold: 1,
        });
      }
    }

    return { cost: Math.round(cost * 10000) / 10000, alerts };
  }

  /**
   * Estimate cost for a judgment
   */
  estimateCost(
    provider: JudgeProvider,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
  ): number {
    const providerPricing = this.pricing[provider] || DEFAULT_PRICING.claude;
    const cost =
      (estimatedInputTokens * providerPricing.input +
        estimatedOutputTokens * providerPricing.output) /
      1_000_000;
    return Math.round(cost * 10000) / 10000;
  }

  /**
   * Check if budget allows a judgment
   */
  canAfford(estimatedCost: number): { allowed: boolean; reason?: string } {
    if (!this.config.budgetLimit) {
      return { allowed: true };
    }

    const projectedTotal = this.totalCost + estimatedCost;
    if (projectedTotal > this.config.budgetLimit) {
      return {
        allowed: false,
        reason: `Projected cost ($${projectedTotal.toFixed(4)}) would exceed budget ($${this.config.budgetLimit.toFixed(2)})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get current cost breakdown
   */
  getBreakdown(): JudgeCostBreakdown {
    const costByProvider: Record<string, number> = {};

    for (const judgment of this.judgments) {
      costByProvider[judgment.provider] = (costByProvider[judgment.provider] || 0) + judgment.cost;
    }

    return {
      totalCost: Math.round(this.totalCost * 10000) / 10000,
      totalInputTokens: this.judgments.reduce((s, j) => s + j.inputTokens, 0),
      totalOutputTokens: this.judgments.reduce((s, j) => s + j.outputTokens, 0),
      judgmentCount: this.judgments.length,
      avgCostPerJudgment:
        this.judgments.length > 0
          ? Math.round((this.totalCost / this.judgments.length) * 10000) / 10000
          : 0,
      costByProvider,
      budgetUsagePercentage: this.config.budgetLimit
        ? Math.round((this.totalCost / this.config.budgetLimit) * 10000) / 100
        : 0,
    };
  }

  /**
   * Get all recorded judgments
   */
  getJudgments(): JudgmentCost[] {
    return [...this.judgments];
  }

  /**
   * Get total cost
   */
  getTotalCost(): number {
    return Math.round(this.totalCost * 10000) / 10000;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.judgments = [];
    this.totalCost = 0;
    this.alertsTriggered.clear();
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    if (!this.config.budgetLimit) return Number.POSITIVE_INFINITY;
    return Math.round((this.config.budgetLimit - this.totalCost) * 10000) / 10000;
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const breakdown = this.getBreakdown();

    // Check if output tokens are disproportionately high
    if (breakdown.totalInputTokens > 0 && breakdown.totalOutputTokens > 0) {
      const ratio = breakdown.totalOutputTokens / breakdown.totalInputTokens;
      if (ratio > 3) {
        recommendations.push('High output/input token ratio. Consider using more concise prompts.');
      }
    }

    // Check average cost
    if (breakdown.avgCostPerJudgment > 0.1) {
      recommendations.push(
        'Average judgment cost is high. Consider using a cheaper model or shorter prompts.',
      );
    }

    // Check budget usage
    if (breakdown.budgetUsagePercentage > 75) {
      recommendations.push(
        'Budget usage is high. Consider reducing evaluation frequency or using cheaper models.',
      );
    }

    return recommendations;
  }
}

/**
 * Estimate tokens for a prompt
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Estimate output tokens for a judgment response
 */
export function estimateOutputTokens(_type: string): number {
  // JSON response with score, explanation, confidence
  const baseTokens = 50; // For JSON structure
  const explanationTokens = 30; // ~100 chars explanation
  return baseTokens + explanationTokens;
}
