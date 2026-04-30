import {
  createImprovementGate,
  createMetricRegressionGate,
  createNoRegressionGate,
  createSignificanceGate,
  getBaselinePreset,
  getStrictBaselinePreset,
} from '@reaatech/agent-eval-harness-gate';
import type { AggregatedResults, RunComparisonResult } from '@reaatech/agent-eval-harness-suite';
import { describe, expect, it } from 'vitest';

function makeAggregatedResults(overrides?: Partial<AggregatedResults>): AggregatedResults {
  return {
    runId: 'test-run-001',
    config: { name: 'test-suite', metrics: [] },
    overallMetrics: {
      overallScore: 0.85,
      avgFaithfulness: 0.88,
      avgRelevance: 0.82,
      toolCorrectnessRate: 0.95,
      avgCostPerTask: 0.03,
      latencyP50: 800,
      latencyP90: 1500,
      latencyP99: 2000,
      slaViolations: 0,
    },
    metricBreakdown: {
      overall_score: {
        name: 'overall_score',
        avgScore: 0.85,
        minScore: 0.8,
        maxScore: 0.9,
        stdDev: 0.05,
        passRate: 1,
        weight: 1,
      },
    },
    trajectoryResults: [],
    summary: {
      totalTrajectories: 100,
      passedTrajectories: 90,
      failedTrajectories: 10,
      passRate: 90,
      overallPassed: true,
      durationMs: 5000,
    },
    timestamp: '2026-04-17T00:00:00Z',
    ...overrides,
  };
}

function makeComparisonResult(overrides?: Partial<RunComparisonResult>): RunComparisonResult {
  return {
    baselineRunId: 'baseline-001',
    candidateRunId: 'test-run-001',
    scoreDiff: 0.05,
    metricDiffs: [
      {
        metric: 'overall_score',
        baseline: 0.8,
        candidate: 0.85,
        diff: 0.05,
        percentChange: 6.25,
        effectSize: 0.5,
      },
      {
        metric: 'faithfulness',
        baseline: 0.83,
        candidate: 0.88,
        diff: 0.05,
        percentChange: 6.02,
        effectSize: 0.4,
      },
    ],
    statisticalSignificance: {
      test: 't-test',
      pValue: 0.03,
      confidenceInterval: [0.01, 0.09],
      significant: true,
      alpha: 0.05,
    },
    regressions: [],
    improvements: [
      {
        metric: 'overall_score',
        baseline: 0.8,
        candidate: 0.85,
        gain: 0.05,
        significance: 'minor',
      },
    ],
    summary: {
      verdict: 'improved',
      description: 'Candidate improved compared to baseline',
      recommendation: 'approve',
      keyFindings: ['Overall score improved by 5.0%'],
    },
    ...overrides,
  };
}

const results = makeAggregatedResults();

describe('Baseline gate factories', () => {
  it('createNoRegressionGate should return regression type gate', () => {
    const gate = createNoRegressionGate();
    expect(gate.name).toBe('no-regression');
    expect(gate.type).toBe('regression');
  });

  it('createImprovementGate should default to minImprovement 0', () => {
    const gate = createImprovementGate();
    expect(gate.name).toBe('overall-improvement');
    expect(gate.type).toBe('custom');
  });

  it('createImprovementGate should accept custom minImprovement', () => {
    const gate = createImprovementGate(0.05);
    expect(gate.description).toContain('5');
  });

  it('createSignificanceGate should create significance gate', () => {
    const gate = createSignificanceGate(0.01);
    expect(gate.name).toBe('statistical-significance');
    expect(gate.type).toBe('custom');
  });

  it('createMetricRegressionGate should include metric in name', () => {
    const gate = createMetricRegressionGate('faithfulness');
    expect(gate.name).toBe('no-regression-faithfulness');
  });

  it('createMetricRegressionGate should accept allowDecline', () => {
    const gate = createMetricRegressionGate('relevance', 0.05);
    expect(gate.description).toContain('relevance');
  });
});

describe('Baseline presets', () => {
  it('getBaselinePreset should return no-regression and improvement gates', () => {
    const gates = getBaselinePreset();
    expect(gates).toHaveLength(2);
    expect(gates[0]?.name).toBe('no-regression');
    expect(gates[1]?.name).toBe('overall-improvement');
  });

  it('getStrictBaselinePreset should return more gates', () => {
    const gates = getStrictBaselinePreset();
    expect(gates.length).toBeGreaterThanOrEqual(4);
    expect(gates.some((g) => g.name === 'no-regression')).toBe(true);
    expect(gates.some((g) => g.name === 'statistical-significance')).toBe(true);
  });
});

describe('Baseline gates customFn direct evaluation', () => {
  describe('createImprovementGate customFn', () => {
    it('should pass when improvement meets threshold', () => {
      const gate = createImprovementGate(0.03);
      const comparison = makeComparisonResult({ scoreDiff: 0.05 });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(true);
      expect(result?.reason).toContain('improved');
    });

    it('should fail when improvement below threshold', () => {
      const gate = createImprovementGate(0.1);
      const comparison = makeComparisonResult({ scoreDiff: 0.05 });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(false);
      expect(result?.reason).toContain('5.0%');
    });

    it('should fail when no comparison provided', () => {
      const gate = createImprovementGate(0);
      const result = gate.customFn?.(results, undefined);
      expect(result?.passed).toBe(false);
      expect(result?.reason).toContain('No comparison');
    });
  });

  describe('createSignificanceGate customFn', () => {
    it('should pass when p-value below alpha', () => {
      const gate = createSignificanceGate(0.05);
      const comparison = makeComparisonResult({
        statisticalSignificance: {
          test: 't-test',
          pValue: 0.02,
          confidenceInterval: [0.01, 0.09],
          significant: true,
          alpha: 0.05,
        },
      });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(true);
      expect(result?.reason).toContain('significant');
    });

    it('should fail when p-value above alpha', () => {
      const gate = createSignificanceGate(0.05);
      const comparison = makeComparisonResult({
        statisticalSignificance: {
          test: 't-test',
          pValue: 0.1,
          confidenceInterval: [-0.01, 0.11],
          significant: false,
          alpha: 0.05,
        },
      });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(false);
      expect(result?.reason).toContain('not statistically significant');
    });

    it('should fail when no comparison provided', () => {
      const gate = createSignificanceGate(0.05);
      const result = gate.customFn?.(results, undefined);
      expect(result?.passed).toBe(false);
    });
  });

  describe('createMetricRegressionGate customFn', () => {
    it('should pass when metric improved', () => {
      const gate = createMetricRegressionGate('faithfulness', 0);
      const comparison = makeComparisonResult({
        metricDiffs: [
          {
            metric: 'faithfulness',
            baseline: 0.8,
            candidate: 0.88,
            diff: 0.08,
            percentChange: 10,
            effectSize: 0.5,
          },
        ],
      });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(true);
    });

    it('should fail when metric declined beyond allowance', () => {
      const gate = createMetricRegressionGate('faithfulness', 0);
      const comparison = makeComparisonResult({
        metricDiffs: [
          {
            metric: 'faithfulness',
            baseline: 0.9,
            candidate: 0.8,
            diff: -0.1,
            percentChange: -11.1,
            effectSize: -0.8,
          },
        ],
      });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(false);
    });

    it('should pass when decline within allowance', () => {
      const gate = createMetricRegressionGate('faithfulness', 0.1);
      const comparison = makeComparisonResult({
        metricDiffs: [
          {
            metric: 'faithfulness',
            baseline: 0.9,
            candidate: 0.85,
            diff: -0.05,
            percentChange: -5.56,
            effectSize: -0.3,
          },
        ],
      });
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(true);
    });

    it('should fail when metric not found in comparison', () => {
      const gate = createMetricRegressionGate('nonexistent', 0);
      const comparison = makeComparisonResult();
      const result = gate.customFn?.(results, comparison);
      expect(result?.passed).toBe(false);
      expect(result?.reason).toContain('not found');
    });

    it('should fail when no comparison provided', () => {
      const gate = createMetricRegressionGate('faithfulness', 0);
      const result = gate.customFn?.(results, undefined);
      expect(result?.passed).toBe(false);
    });
  });
});
