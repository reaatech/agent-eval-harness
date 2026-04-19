/**
 * Metric configuration
 */
export interface MetricConfig {
  /** Metric name */
  name: string;
  /** Whether metric is enabled */
  enabled: boolean;
  /** Weight for overall score */
  weight: number;
  /** Threshold for passing */
  threshold?: number;
  /** Custom configuration */
  config?: Record<string, unknown>;
}

/**
 * Suite configuration
 */
export interface SuiteConfig {
  /** Suite name */
  name: string;
  /** Suite description */
  description?: string;
  /** Metrics to evaluate */
  metrics: MetricConfig[];
  /** Judge configuration */
  judge?: JudgeConfig;
  /** Golden trajectory path */
  goldenPath?: string;
  /** Baseline run ID for comparison */
  baseline?: string;
  /** Output configuration */
  output?: OutputConfig;
}

/**
 * Judge configuration
 */
export interface JudgeConfig {
  /** Judge model */
  model: string;
  /** Judge provider */
  provider: string;
  /** Budget limit */
  budgetLimit?: number;
  /** Calibration enabled */
  calibrationEnabled?: boolean;
}

/**
 * Output configuration
 */
export interface OutputConfig {
  /** Output formats */
  formats: string[];
  /** Output directory */
  directory: string;
  /** Whether to include detailed results */
  includeDetails: boolean;
}

/**
 * Default metric configurations
 */
export const DEFAULT_METRICS: MetricConfig[] = [
  { name: 'faithfulness', enabled: true, weight: 0.25, threshold: 0.8 },
  { name: 'relevance', enabled: true, weight: 0.25, threshold: 0.8 },
  { name: 'tool_correctness', enabled: true, weight: 0.2, threshold: 0.9 },
  { name: 'cost', enabled: true, weight: 0.1, threshold: 0.05 },
  { name: 'latency', enabled: true, weight: 0.2, threshold: 5000 },
];

import { parse as parseYaml } from 'yaml';

export function parseConfig(yamlString: string): SuiteConfig {
  const parsed = parseYaml(yamlString);
  return (parsed ?? {}) as unknown as SuiteConfig;
}

/**
 * Validate suite configuration
 */
export function validateConfig(config: SuiteConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.name) {
    errors.push('Suite name is required');
  }

  if (!config.metrics || config.metrics.length === 0) {
    errors.push('At least one metric is required');
  }

  // Validate weights sum to 1
  const totalWeight = config.metrics.filter((m) => m.enabled).reduce((sum, m) => sum + m.weight, 0);

  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push(`Enabled metric weights must sum to 1.0 (got ${totalWeight.toFixed(2)})`);
  }

  // Validate thresholds
  const scoreMetrics = new Set([
    'faithfulness',
    'relevance',
    'tool_correctness',
    'coherence',
    'goal_completion',
  ]);
  for (const metric of config.metrics) {
    if (metric.enabled && metric.threshold !== undefined) {
      if (scoreMetrics.has(metric.name)) {
        if (metric.threshold < 0 || metric.threshold > 1) {
          errors.push(`Threshold for ${metric.name} must be between 0 and 1`);
        }
      } else if (metric.threshold < 0) {
        errors.push(`Threshold for ${metric.name} must be non-negative`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create default suite configuration
 */
export function createDefaultConfig(name: string): SuiteConfig {
  return {
    name,
    description: `Evaluation suite: ${name}`,
    metrics: [...DEFAULT_METRICS],
    output: {
      formats: ['json'],
      directory: './results',
      includeDetails: true,
    },
  };
}

/**
 * Merge partial configuration with defaults
 */
export function mergeConfig(partial: Partial<SuiteConfig>): SuiteConfig {
  const base = createDefaultConfig(partial.name || 'default');

  const merged: SuiteConfig = {
    ...base,
    ...partial,
    metrics: partial.metrics || base.metrics,
  };
  if (partial.output !== undefined) {
    merged.output = partial.output;
  }

  return merged;
}

/**
 * Get enabled metrics
 */
export function getEnabledMetrics(config: SuiteConfig): MetricConfig[] {
  return config.metrics.filter((m) => m.enabled);
}

/**
 * Calculate overall score from metric scores
 */
export function calculateOverallScore(
  metricScores: Record<string, number>,
  config: SuiteConfig,
): number {
  let totalScore = 0;
  let totalWeight = 0;

  for (const metric of config.metrics) {
    const score = metricScores[metric.name];
    if (metric.enabled && score !== undefined) {
      totalScore += score * metric.weight;
      totalWeight += metric.weight;
    }
  }

  return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 1000) / 1000 : 0;
}

/**
 * Check if all thresholds are met
 */
export function checkThresholds(
  metricScores: Record<string, number>,
  config: SuiteConfig,
): { passed: boolean; failures: Array<{ metric: string; score: number; threshold: number }> } {
  const failures: Array<{ metric: string; score: number; threshold: number }> = [];

  for (const metric of config.metrics) {
    if (metric.enabled && metric.threshold !== undefined) {
      const score = metricScores[metric.name];
      if (score === undefined) {
        continue;
      } else if (score < metric.threshold) {
        failures.push({ metric: metric.name, score, threshold: metric.threshold });
      }
    }
  }

  return { passed: failures.length === 0, failures };
}
