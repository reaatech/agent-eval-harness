import type { GateDefinition } from './engine.js';
import type { RunComparisonResult } from '../suite/comparator.js';

/**
 * Create no-regression gate
 */
export function createNoRegressionGate(): GateDefinition {
  return {
    name: 'no-regression',
    type: 'regression',
    description: 'No regressions allowed compared to baseline',
  };
}

/**
 * Create overall score improvement gate
 */
export function createImprovementGate(minImprovement = 0): GateDefinition {
  return {
    name: 'overall-improvement',
    type: 'custom',
    customFn: (_results, comparison?: RunComparisonResult): { passed: boolean; reason: string } => {
      if (!comparison) {
        return { passed: false, reason: 'No comparison data available' };
      }
      const passed = comparison.scoreDiff >= minImprovement;
      return {
        passed,
        reason: passed
          ? `Overall score improved by ${(comparison.scoreDiff * 100).toFixed(1)}% (>= ${(minImprovement * 100).toFixed(1)}%)`
          : `Overall score change ${(comparison.scoreDiff * 100).toFixed(1)}% < required ${(minImprovement * 100).toFixed(1)}%`,
      };
    },
    description: `Overall score must improve by at least ${(minImprovement * 100).toFixed(0)}%`,
  };
}

/**
 * Create statistical significance gate
 */
export function createSignificanceGate(alpha = 0.05): GateDefinition {
  return {
    name: 'statistical-significance',
    type: 'custom',
    customFn: (_results, comparison?: RunComparisonResult): { passed: boolean; reason: string } => {
      if (!comparison) {
        return { passed: false, reason: 'No comparison data available' };
      }
      const passed = comparison.statisticalSignificance.pValue < alpha;
      return {
        passed,
        reason: passed
          ? `Difference is statistically significant (p=${comparison.statisticalSignificance.pValue.toFixed(4)} < ${alpha})`
          : `Difference is not statistically significant (p=${comparison.statisticalSignificance.pValue.toFixed(4)} >= ${alpha})`,
      };
    },
    description: `Difference must be statistically significant (α=${alpha})`,
  };
}

/**
 * Create metric-specific regression gate
 */
export function createMetricRegressionGate(metric: string, allowDecline = 0): GateDefinition {
  return {
    name: `no-regression-${metric}`,
    type: 'custom',
    customFn: (_results, comparison?: RunComparisonResult): { passed: boolean; reason: string } => {
      if (!comparison) {
        return { passed: false, reason: 'No comparison data available' };
      }
      const metricDiff = comparison.metricDiffs.find((d) => d.metric === metric);
      if (!metricDiff) {
        return { passed: false, reason: `Metric '${metric}' not found in comparison` };
      }
      const passed = metricDiff.diff >= -allowDecline;
      return {
        passed,
        reason: passed
          ? `${metric}: ${metricDiff.baseline.toFixed(3)} → ${metricDiff.candidate.toFixed(3)} (decline ${metricDiff.diff.toFixed(3)} >= ${(-allowDecline).toFixed(3)})`
          : `${metric}: ${metricDiff.baseline.toFixed(3)} → ${metricDiff.candidate.toFixed(3)} (decline ${metricDiff.diff.toFixed(3)} < ${(-allowDecline).toFixed(3)})`,
      };
    },
    description: `${metric} must not decline by more than ${(allowDecline * 100).toFixed(0)}%`,
  };
}

/**
 * Create baseline comparison preset
 */
export function getBaselinePreset(): GateDefinition[] {
  return [createNoRegressionGate(), createImprovementGate(0)];
}

/**
 * Create strict baseline preset
 */
export function getStrictBaselinePreset(): GateDefinition[] {
  return [
    createNoRegressionGate(),
    createImprovementGate(0.05),
    createSignificanceGate(0.05),
    createMetricRegressionGate('faithfulness', 0),
    createMetricRegressionGate('relevance', 0),
    createMetricRegressionGate('tool_correctness', 0),
  ];
}
