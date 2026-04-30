import {
  GateEngine,
  createGateEngine,
  createNoRegressionGate,
  createOverallQualityGate,
  getBaselinePreset,
  getStandardPreset,
} from '@reaatech/agent-eval-harness-gate';
import type { GateDefinition } from '@reaatech/agent-eval-harness-gate';
import type {
  AggregatedResults,
  MetricBreakdown,
  RunComparisonResult,
} from '@reaatech/agent-eval-harness-suite';
import { beforeEach, describe, expect, it } from 'vitest';

function makeMetricBreakdown(
  name: string,
  avgScore: number,
  overrides?: Partial<MetricBreakdown>,
): MetricBreakdown {
  return {
    name,
    avgScore,
    minScore: avgScore - 0.05,
    maxScore: avgScore + 0.05,
    stdDev: 0.05,
    passRate: 1,
    weight: 1,
    ...overrides,
  };
}

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
      overall_score: makeMetricBreakdown('overall_score', 0.85),
      avg_cost_per_task: makeMetricBreakdown('avg_cost_per_task', 0.03),
      faithfulness: makeMetricBreakdown('faithfulness', 0.88),
      relevance: makeMetricBreakdown('relevance', 0.82),
      tool_correctness: makeMetricBreakdown('tool_correctness', 0.95),
      latency: makeMetricBreakdown('latency', 2000),
      cost: makeMetricBreakdown('cost', 0.03),
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

describe('GateEngine', () => {
  describe('constructor', () => {
    it('should filter out disabled gates', () => {
      const gates: GateDefinition[] = [
        { name: 'a', type: 'threshold', metric: 'overall_score', operator: '>=', threshold: 0.8 },
        {
          name: 'b',
          type: 'threshold',
          metric: 'faithfulness',
          operator: '>=',
          threshold: 0.8,
          enabled: false,
        },
        { name: 'c', type: 'threshold', metric: 'relevance', operator: '>=', threshold: 0.8 },
      ];
      const engine = new GateEngine(gates);
      expect(engine.getGates()).toHaveLength(2);
      expect(engine.getGates().map((g) => g.name)).toEqual(['a', 'c']);
    });

    it('should accept custom cacheTTL', () => {
      const engine = new GateEngine([], 5000);
      expect(engine).toBeDefined();
    });
  });

  describe('createGateEngine', () => {
    it('should create a GateEngine instance', () => {
      const engine = createGateEngine([]);
      expect(engine).toBeInstanceOf(GateEngine);
    });
  });

  describe('evaluate - threshold gates', () => {
    let engine: GateEngine;

    beforeEach(() => {
      const gates: GateDefinition[] = [
        {
          name: 'overall-quality',
          type: 'threshold',
          metric: 'overall_score',
          operator: '>=',
          threshold: 0.8,
        },
        {
          name: 'cost-per-task',
          type: 'threshold',
          metric: 'avg_cost_per_task',
          operator: '<=',
          threshold: 0.05,
        },
      ];
      engine = createGateEngine(gates);
    });

    it('should pass all gates when metrics meet thresholds', () => {
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.overallPassed).toBe(true);
      expect(summary.passedGates).toBe(2);
      expect(summary.failedGates).toBe(0);
      expect(summary.totalGates).toBe(2);
      expect(summary.runId).toBe('test-run-001');
    });

    it('should fail when a threshold is not met', () => {
      const results = makeAggregatedResults({
        metricBreakdown: {
          overall_score: makeMetricBreakdown('overall_score', 0.7),
          avg_cost_per_task: makeMetricBreakdown('avg_cost_per_task', 0.03),
        },
      });
      const summary = engine.evaluate(results);

      expect(summary.overallPassed).toBe(false);
      expect(summary.failedGates).toBe(1);
    });

    it('should return detailed results for each gate', () => {
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.results).toHaveLength(2);
      const qualityResult = summary.results.find((r) => r.name === 'overall-quality');
      expect(qualityResult).toBeDefined();
      expect(qualityResult?.passed).toBe(true);
      expect(qualityResult?.actualValue).toBe(0.85);
      expect(qualityResult?.expectedValue).toBe(0.8);
      expect(qualityResult?.type).toBe('threshold');
    });

    it('should handle missing metric in metricBreakdown', () => {
      const gates: GateDefinition[] = [
        {
          name: 'missing-metric',
          type: 'threshold',
          metric: 'nonexistent',
          operator: '>=',
          threshold: 0.5,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.overallPassed).toBe(false);
      const gateResult = summary.results[0];
      expect(gateResult).toBeDefined();
      expect(gateResult?.passed).toBe(false);
      expect(gateResult?.reason).toContain('not found');
    });

    it('should handle missing metric property on gate definition', () => {
      const gates: GateDefinition[] = [{ name: 'no-metric', type: 'threshold' } as GateDefinition];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.results[0]?.passed).toBe(false);
      expect(summary.results[0]?.reason).toContain('Missing metric');
    });

    it('should support greater-than operator', () => {
      const gates: GateDefinition[] = [
        {
          name: 'strict-quality',
          type: 'threshold',
          metric: 'overall_score',
          operator: '>',
          threshold: 0.84,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);
      expect(summary.results[0]?.passed).toBe(true);
    });

    it('should support less-than operator', () => {
      const gates: GateDefinition[] = [
        {
          name: 'latency-check',
          type: 'threshold',
          metric: 'latency',
          operator: '<',
          threshold: 3000,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);
      expect(summary.results[0]?.passed).toBe(true);
    });

    it('should support equality operator', () => {
      const gates: GateDefinition[] = [
        { name: 'exact-cost', type: 'threshold', metric: 'cost', operator: '==', threshold: 0.03 },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);
      expect(summary.results[0]?.passed).toBe(true);
    });

    it('should support not-equal operator', () => {
      const gates: GateDefinition[] = [
        { name: 'not-zero', type: 'threshold', metric: 'cost', operator: '!=', threshold: 0 },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);
      expect(summary.results[0]?.passed).toBe(true);
    });
  });

  describe('evaluate - baseline-comparison gates', () => {
    it('should pass when no regression detected', () => {
      const gates: GateDefinition[] = [
        {
          name: 'no-score-regression',
          type: 'baseline-comparison',
          metric: 'overall_score',
          allowRegression: false,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult();

      const summary = engine.evaluate(results, comparison);
      expect(summary.overallPassed).toBe(true);
    });

    it('should fail when regression detected and not allowed', () => {
      const gates: GateDefinition[] = [
        {
          name: 'no-score-regression',
          type: 'baseline-comparison',
          metric: 'overall_score',
          allowRegression: false,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult({
        metricDiffs: [
          {
            metric: 'overall_score',
            baseline: 0.9,
            candidate: 0.85,
            diff: -0.05,
            percentChange: -5.56,
            effectSize: -0.5,
          },
        ],
      });

      const summary = engine.evaluate(results, comparison);
      expect(summary.overallPassed).toBe(false);
      expect(summary.results[0]?.reason).toContain('regression not allowed');
    });

    it('should pass when regression is allowed', () => {
      const gates: GateDefinition[] = [
        {
          name: 'allow-regression',
          type: 'baseline-comparison',
          metric: 'overall_score',
          allowRegression: true,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult({
        metricDiffs: [
          {
            metric: 'overall_score',
            baseline: 0.9,
            candidate: 0.85,
            diff: -0.05,
            percentChange: -5.56,
            effectSize: -0.5,
          },
        ],
      });

      const summary = engine.evaluate(results, comparison);
      expect(summary.overallPassed).toBe(true);
    });

    it('should fail when no comparison data provided', () => {
      const gates: GateDefinition[] = [
        { name: 'baseline-gate', type: 'baseline-comparison', metric: 'overall_score' },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();

      const summary = engine.evaluate(results);
      expect(summary.overallPassed).toBe(false);
      expect(summary.results[0]?.reason).toContain('No comparison data');
    });

    it('should fail when metric not found in comparison', () => {
      const gates: GateDefinition[] = [
        { name: 'baseline-gate', type: 'baseline-comparison', metric: 'nonexistent' },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult();

      const summary = engine.evaluate(results, comparison);
      expect(summary.results[0]?.passed).toBe(false);
      expect(summary.results[0]?.reason).toContain('not found in comparison');
    });

    it('should set actualValue and expectedValue from comparison', () => {
      const gates: GateDefinition[] = [
        { name: 'baseline-gate', type: 'baseline-comparison', metric: 'overall_score' },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult();

      const summary = engine.evaluate(results, comparison);
      expect(summary.results[0]?.actualValue).toBe(0.85);
      expect(summary.results[0]?.expectedValue).toBe(0.8);
    });
  });

  describe('evaluate - regression gates', () => {
    it('should pass when no regressions', () => {
      const gates: GateDefinition[] = [createNoRegressionGate()];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult({ regressions: [] });

      const summary = engine.evaluate(results, comparison);
      expect(summary.results[0]?.passed).toBe(true);
      expect(summary.results[0]?.reason).toContain('No regressions');
    });

    it('should fail when regressions detected', () => {
      const gates: GateDefinition[] = [createNoRegressionGate()];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const comparison = makeComparisonResult({
        regressions: [
          { metric: 'faithfulness', baseline: 0.9, candidate: 0.7, decline: 0.2, severity: 'high' },
        ],
      });

      const summary = engine.evaluate(results, comparison);
      expect(summary.results[0]?.passed).toBe(false);
      expect(summary.results[0]?.reason).toContain('1 regression(s)');
    });

    it('should fail when no comparison data provided', () => {
      const gates: GateDefinition[] = [createNoRegressionGate()];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();

      const summary = engine.evaluate(results);
      expect(summary.results[0]?.passed).toBe(false);
      expect(summary.results[0]?.reason).toContain('No comparison data');
    });
  });

  describe('evaluate - custom gates', () => {
    it('should evaluate custom function gates', () => {
      const gates: GateDefinition[] = [
        {
          name: 'custom-check',
          type: 'custom',
          customFn: (results): { passed: boolean; reason: string } => {
            const passed = results.overallMetrics.slaViolations === 0;
            return { passed, reason: passed ? 'No SLA violations' : 'SLA violations found' };
          },
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.results[0]?.passed).toBe(true);
      expect(summary.results[0]?.name).toBe('custom-check');
      expect(summary.results[0]?.type).toBe('custom');
    });

    it('should handle custom function errors', () => {
      const gates: GateDefinition[] = [
        {
          name: 'failing-custom',
          type: 'custom',
          customFn: (): { passed: boolean; reason: string } => {
            throw new Error('boom');
          },
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.results[0]?.passed).toBe(false);
      expect(summary.results[0]?.reason).toContain('boom');
    });

    it('should handle missing customFn', () => {
      const gates: GateDefinition[] = [{ name: 'no-fn', type: 'custom' } as GateDefinition];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();
      const summary = engine.evaluate(results);

      expect(summary.results[0]?.passed).toBe(false);
      expect(summary.results[0]?.reason).toContain('no evaluation function');
    });
  });

  describe('caching', () => {
    it('should cache results and return cacheHitRate on second call', () => {
      const gates: GateDefinition[] = [
        {
          name: 'quality',
          type: 'threshold',
          metric: 'overall_score',
          operator: '>=',
          threshold: 0.8,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();

      const first = engine.evaluate(results);
      expect(first.cacheHitRate).toBeUndefined();

      const second = engine.evaluate(results);
      expect(second.cacheHitRate).toBe(1);
      expect(second.passedGates).toBe(first.passedGates);
    });

    it('should clear cache', () => {
      const gates: GateDefinition[] = [
        {
          name: 'quality',
          type: 'threshold',
          metric: 'overall_score',
          operator: '>=',
          threshold: 0.8,
        },
      ];
      const engine = createGateEngine(gates);
      const results = makeAggregatedResults();

      engine.evaluate(results);
      engine.clearCache();

      const afterClear = engine.evaluate(results);
      expect(afterClear.cacheHitRate).toBeUndefined();
    });
  });

  describe('gate management', () => {
    it('should add a gate', () => {
      const engine = createGateEngine([]);
      engine.addGate({
        name: 'new-gate',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      });
      expect(engine.getGates()).toHaveLength(1);
    });

    it('should not add disabled gate', () => {
      const engine = createGateEngine([]);
      engine.addGate({
        name: 'disabled',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
        enabled: false,
      });
      expect(engine.getGates()).toHaveLength(0);
    });

    it('should remove a gate by name', () => {
      const engine = createGateEngine([
        { name: 'a', type: 'threshold', metric: 'overall_score', operator: '>=', threshold: 0.8 },
        { name: 'b', type: 'threshold', metric: 'cost', operator: '<=', threshold: 0.05 },
      ]);
      engine.removeGate('a');
      expect(engine.getGates()).toHaveLength(1);
      expect(engine.getGates()[0]?.name).toBe('b');
    });

    it('getGates should return a copy', () => {
      const engine = createGateEngine([
        { name: 'a', type: 'threshold', metric: 'overall_score', operator: '>=', threshold: 0.8 },
      ]);
      const gates = engine.getGates();
      gates.push({ name: 'b', type: 'threshold', metric: 'cost', operator: '<=', threshold: 0.05 });
      expect(engine.getGates()).toHaveLength(1);
    });
  });
});

describe('Integration: full gate evaluation pipeline', () => {
  it('should evaluate standard preset against sample results', () => {
    const preset = getStandardPreset();
    const engine = createGateEngine(preset.gates);
    const results = makeAggregatedResults({
      metricBreakdown: {
        overall_score: makeMetricBreakdown('overall_score', 0.85),
        faithfulness: makeMetricBreakdown('faithfulness', 0.88),
        relevance: makeMetricBreakdown('relevance', 0.82),
        tool_correctness: makeMetricBreakdown('tool_correctness', 0.95),
        cost: makeMetricBreakdown('cost', 0.03),
        latency: makeMetricBreakdown('latency', 2000),
      },
      summary: {
        totalTrajectories: 100,
        passedTrajectories: 96,
        failedTrajectories: 4,
        passRate: 96,
        overallPassed: true,
        durationMs: 5000,
      },
    });

    const summary = engine.evaluate(results);
    expect(summary.runId).toBe('test-run-001');
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);

    const passedResults = summary.results.filter((r) => r.passed);
    expect(passedResults.length).toBeGreaterThan(0);
  });

  it('should evaluate baseline preset with comparison', () => {
    const baselinePreset = getBaselinePreset();
    const engine = createGateEngine(baselinePreset);
    const results = makeAggregatedResults();
    const comparison = makeComparisonResult();

    const summary = engine.evaluate(results, comparison);
    expect(summary.results).toHaveLength(2);
    expect(summary.runId).toBe('test-run-001');
  });

  it('should handle mixed threshold and baseline gates together', () => {
    const gates: GateDefinition[] = [
      createOverallQualityGate(0.8),
      createNoRegressionGate(),
      { name: 'cost-check', type: 'threshold', metric: 'cost', operator: '<=', threshold: 0.05 },
    ];
    const engine = createGateEngine(gates);
    const results = makeAggregatedResults();
    const comparison = makeComparisonResult({
      regressions: [],
    });

    const summary = engine.evaluate(results, comparison);
    expect(summary.totalGates).toBe(3);
    expect(summary.overallPassed).toBe(true);
  });
});
