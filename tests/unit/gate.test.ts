import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createImprovementGate,
  createMetricRegressionGate,
  createNoRegressionGate,
  createSignificanceGate,
  getBaselinePreset,
  getStrictBaselinePreset,
} from '../../src/gate/baseline-gates.js';
import {
  CIIntegration,
  exportForCI,
  outputGitHubAnnotations,
  setGitHubOutput,
  writeJUnitReport,
} from '../../src/gate/ci-integration.js';
import { GateEngine, createGateEngine } from '../../src/gate/engine.js';
import type { GateDefinition, GateEvaluationSummary } from '../../src/gate/engine.js';
import {
  buildThresholdGates,
  createCostGate,
  createFaithfulnessGate,
  createLatencyGate,
  createOverallQualityGate,
  createPassRateGate,
  createRelevanceGate,
  createSLAViolationsGate,
  createToolCorrectnessGate,
  getLenientPreset,
  getStandardPreset,
  getStrictPreset,
} from '../../src/gate/threshold-gates.js';
import type { RunComparisonResult } from '../../src/suite/comparator.js';
import type { AggregatedResults, MetricBreakdown } from '../../src/suite/results.js';

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

describe('Threshold gate factories', () => {
  it('createOverallQualityGate should use default threshold 0.8', () => {
    const gate = createOverallQualityGate();
    expect(gate.name).toBe('overall-quality');
    expect(gate.type).toBe('threshold');
    expect(gate.metric).toBe('overall_score');
    expect(gate.operator).toBe('>=');
    expect(gate.threshold).toBe(0.8);
  });

  it('createOverallQualityGate should accept custom threshold', () => {
    const gate = createOverallQualityGate(0.95);
    expect(gate.threshold).toBe(0.95);
  });

  it('createFaithfulnessGate should default to 0.8', () => {
    const gate = createFaithfulnessGate();
    expect(gate.name).toBe('faithfulness');
    expect(gate.metric).toBe('faithfulness');
    expect(gate.threshold).toBe(0.8);
  });

  it('createRelevanceGate should default to 0.8', () => {
    const gate = createRelevanceGate();
    expect(gate.name).toBe('relevance');
    expect(gate.metric).toBe('relevance');
  });

  it('createToolCorrectnessGate should default to 0.9', () => {
    const gate = createToolCorrectnessGate();
    expect(gate.name).toBe('tool-correctness');
    expect(gate.metric).toBe('tool_correctness');
    expect(gate.threshold).toBe(0.9);
  });

  it('createCostGate should default to 0.05', () => {
    const gate = createCostGate();
    expect(gate.name).toBe('cost-per-task');
    expect(gate.metric).toBe('cost');
    expect(gate.operator).toBe('<=');
    expect(gate.threshold).toBe(0.05);
  });

  it('createLatencyGate should default to 5000ms', () => {
    const gate = createLatencyGate();
    expect(gate.name).toBe('latency-p99');
    expect(gate.metric).toBe('latency');
    expect(gate.threshold).toBe(5000);
  });

  it('createPassRateGate should create custom gate', () => {
    const gate = createPassRateGate(0.9);
    expect(gate.name).toBe('pass-rate');
    expect(gate.type).toBe('custom');
    expect(gate.customFn).toBeDefined();
  });

  it('createSLAViolationsGate should create custom gate', () => {
    const gate = createSLAViolationsGate(0);
    expect(gate.name).toBe('sla-violations');
    expect(gate.type).toBe('custom');
    expect(gate.customFn).toBeDefined();
  });
});

describe('Threshold presets', () => {
  it('getStandardPreset should return 7 gates', () => {
    const preset = getStandardPreset();
    expect(preset.name).toBe('standard');
    expect(preset.gates).toHaveLength(7);
    expect(preset.gates.some((g) => g.name === 'overall-quality')).toBe(true);
  });

  it('getStrictPreset should have higher thresholds', () => {
    const preset = getStrictPreset();
    expect(preset.name).toBe('strict');
    const qualityGate = preset.gates.find((g) => g.name === 'overall-quality');
    expect(qualityGate?.threshold).toBe(0.9);
  });

  it('getLenientPreset should have lower thresholds', () => {
    const preset = getLenientPreset();
    expect(preset.name).toBe('lenient');
    const qualityGate = preset.gates.find((g) => g.name === 'overall-quality');
    expect(qualityGate?.threshold as number).toBeLessThanOrEqual(0.7);
  });
});

describe('buildThresholdGates', () => {
  it('should build gates from config', () => {
    const gates = buildThresholdGates({
      overallQuality: 0.85,
      faithfulness: 0.75,
    });
    expect(gates).toHaveLength(2);
    expect(gates[0]?.threshold).toBe(0.85);
    expect(gates[1]?.threshold).toBe(0.75);
  });

  it('should return empty array for empty config', () => {
    const gates = buildThresholdGates({});
    expect(gates).toHaveLength(0);
  });

  it('should build all gate types', () => {
    const gates = buildThresholdGates({
      overallQuality: 0.8,
      faithfulness: 0.8,
      relevance: 0.8,
      toolCorrectness: 0.9,
      costPerTask: 0.05,
      latencyP99: 5000,
      passRate: 0.95,
      maxSLAViolations: 0,
    });
    expect(gates).toHaveLength(8);
  });
});

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

describe('Improvement gate evaluation', () => {
  it('should fail because custom gates do not receive comparison data', () => {
    const gate = createImprovementGate(0.03);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults();
    const comparison = makeComparisonResult({ scoreDiff: 0.05 });

    const summary = engine.evaluate(results, comparison);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.results[0]?.reason).toContain('No comparison data');
  });

  it('should fail when no comparison provided', () => {
    const gate = createImprovementGate();
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults();

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.results[0]?.reason).toContain('No comparison data');
  });
});

describe('Significance gate evaluation', () => {
  it('should fail because custom gates do not receive comparison data', () => {
    const gate = createSignificanceGate(0.05);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults();
    const comparison = makeComparisonResult({
      statisticalSignificance: {
        test: 't-test',
        pValue: 0.02,
        confidenceInterval: [0.01, 0.09],
        significant: true,
        alpha: 0.05,
      },
    });

    const summary = engine.evaluate(results, comparison);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.results[0]?.reason).toContain('No comparison data');
  });

  it('should fail when no comparison provided', () => {
    const gate = createSignificanceGate(0.05);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults();

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(false);
  });
});

describe('MetricRegression gate evaluation', () => {
  it('should fail because custom gates do not receive comparison data', () => {
    const gate = createMetricRegressionGate('faithfulness', 0);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults();
    const comparison = makeComparisonResult({
      metricDiffs: [
        {
          metric: 'faithfulness',
          baseline: 0.85,
          candidate: 0.88,
          diff: 0.03,
          percentChange: 3.53,
          effectSize: 0.3,
        },
      ],
    });

    const summary = engine.evaluate(results, comparison);
    expect(summary.results[0]?.passed).toBe(false);
    expect(summary.results[0]?.reason).toContain('No comparison data');
  });

  it('should fail when no comparison provided', () => {
    const gate = createMetricRegressionGate('faithfulness', 0);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults();

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(false);
  });
});

describe('Pass rate gate evaluation', () => {
  it('should pass when pass rate meets threshold', () => {
    const gate = createPassRateGate(0.9);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults({
      summary: {
        totalTrajectories: 100,
        passedTrajectories: 95,
        failedTrajectories: 5,
        passRate: 95,
        overallPassed: true,
        durationMs: 5000,
      },
    });

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(true);
  });

  it('should fail when pass rate below threshold', () => {
    const gate = createPassRateGate(0.95);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults({
      summary: {
        totalTrajectories: 100,
        passedTrajectories: 90,
        failedTrajectories: 10,
        passRate: 90,
        overallPassed: true,
        durationMs: 5000,
      },
    });

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(false);
  });
});

describe('SLA violations gate evaluation', () => {
  it('should pass when no SLA violations', () => {
    const gate = createSLAViolationsGate(0);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults({
      overallMetrics: {
        ...makeAggregatedResults().overallMetrics,
        slaViolations: 0,
      },
    });

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(true);
  });

  it('should fail when SLA violations exceed limit', () => {
    const gate = createSLAViolationsGate(0);
    const engine = createGateEngine([gate]);
    const results = makeAggregatedResults({
      overallMetrics: {
        ...makeAggregatedResults().overallMetrics,
        slaViolations: 3,
      },
    });

    const summary = engine.evaluate(results);
    expect(summary.results[0]?.passed).toBe(false);
  });
});

describe('CIIntegration', () => {
  function makeSummary(overrides?: Partial<GateEvaluationSummary>): GateEvaluationSummary {
    return {
      runId: 'test-run-001',
      totalGates: 2,
      passedGates: 2,
      failedGates: 0,
      overallPassed: true,
      results: [
        {
          name: 'quality',
          passed: true,
          reason: 'overall_score (0.850) >= 0.8',
          actualValue: 0.85,
          expectedValue: 0.8,
          type: 'threshold' as const,
        },
        {
          name: 'cost',
          passed: true,
          reason: 'cost (0.030) <= 0.05',
          actualValue: 0.03,
          expectedValue: 0.05,
          type: 'threshold' as const,
        },
      ],
      durationMs: 100,
      ...overrides,
    };
  }

  describe('getExitCode', () => {
    it('should return 0 for passed gates', () => {
      expect(CIIntegration.getExitCode(makeSummary())).toBe(0);
    });

    it('should return 1 for failed gates', () => {
      expect(
        CIIntegration.getExitCode(
          makeSummary({
            overallPassed: false,
            passedGates: 1,
            failedGates: 1,
            results: [
              {
                name: 'quality',
                passed: false,
                reason: 'failed',
                actualValue: 0.7,
                expectedValue: 0.8,
                type: 'threshold',
              },
            ],
          }),
        ),
      ).toBe(1);
    });
  });

  describe('generateGitHubAnnotations', () => {
    it('should generate notice for passed gates', () => {
      const output = CIIntegration.generateGitHubAnnotations(makeSummary());
      expect(output).toContain('::notice');
      expect(output).toContain('quality');
    });

    it('should generate error for failed gates', () => {
      const output = CIIntegration.generateGitHubAnnotations(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'failed',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(output).toContain('::error');
      expect(output).toContain('quality');
    });
  });

  describe('generateJUnitReport', () => {
    it('should generate valid JUnit XML', () => {
      const xml = CIIntegration.generateJUnitReport(makeSummary());
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<testsuite');
      expect(xml).toContain('<testcase');
      expect(xml).toContain('name="quality"');
    });

    it('should include failure element for failed gates', () => {
      const xml = CIIntegration.generateJUnitReport(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'Score too low',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(xml).toContain('<failure');
      expect(xml).toContain('Score too low');
    });
  });

  describe('generatePRComment', () => {
    it('should generate markdown table with results', () => {
      const comment = CIIntegration.generatePRComment(makeSummary());
      expect(comment).toContain('## ✅ Evaluation Gates');
      expect(comment).toContain('quality');
      expect(comment).toContain('| Gate | Status | Details |');
    });

    it('should show failed status when gates fail', () => {
      const comment = CIIntegration.generatePRComment(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'Score too low',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(comment).toContain('## ❌ Evaluation Gates');
    });
  });

  describe('generateStepSummary', () => {
    it('should generate step summary markdown', () => {
      const summary = CIIntegration.generateStepSummary(makeSummary());
      expect(summary).toContain('### Gate Evaluation Results');
      expect(summary).toContain('✅ Passed');
      expect(summary).toContain('quality');
    });
  });

  describe('generateEnvVars', () => {
    it('should generate environment variables', () => {
      const env = CIIntegration.generateEnvVars(makeSummary());
      expect(env.EVAL_GATE_PASSED).toBe('true');
      expect(env.EVAL_GATE_TOTAL).toBe('2');
      expect(env.EVAL_GATE_PASSED_COUNT).toBe('2');
      expect(env.EVAL_GATE_FAILED_COUNT).toBe('0');
      expect(env.EVAL_GATE_DURATION_MS).toBe('100');
      expect(env.EVAL_GATE_FAILURES).toBe('[]');
    });

    it('should list failed gate names', () => {
      const env = CIIntegration.generateEnvVars(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'Failed',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(env.EVAL_GATE_PASSED).toBe('false');
      expect(env.EVAL_GATE_FAILURES).toContain('quality');
    });
  });

  describe('parseGateConfig', () => {
    it('should parse YAML gate configuration', () => {
      const yaml = `
- name: quality
  type: threshold
  metric: overall_score
  threshold: 0.8
- name: cost
  type: threshold
  metric: cost
  threshold: 0.05
`;
      const gates = CIIntegration.parseGateConfig(yaml);
      expect(gates).toHaveLength(2);
      expect(gates[0]?.name).toBe('quality');
      expect(gates[1]?.name).toBe('cost');
    });

    it('should ignore comments and blank lines', () => {
      const yaml = `# This is a comment
- name: test
  type: threshold
  metric: overall_score
`;
      const gates = CIIntegration.parseGateConfig(yaml);
      expect(gates).toHaveLength(1);
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

    const exitCode = CIIntegration.getExitCode(summary);
    expect(exitCode).toBe(summary.overallPassed ? 0 : 1);

    const junit = CIIntegration.generateJUnitReport(summary);
    expect(junit).toContain('<?xml');

    const prComment = CIIntegration.generatePRComment(summary);
    expect(prComment).toContain('Evaluation Gates');
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

describe('Baseline gates customFn direct evaluation', () => {
  const results = makeAggregatedResults();

  describe('createImprovementGate customFn', () => {
    it('should pass when improvement meets threshold', () => {
      const gate = createImprovementGate(0.03);
      const comparison = makeComparisonResult({ scoreDiff: 0.05 });
      const result = gate.customFn?.(results, comparison);
      expect(result.passed).toBe(true);
      expect(result.reason).toContain('improved');
    });

    it('should fail when improvement below threshold', () => {
      const gate = createImprovementGate(0.1);
      const comparison = makeComparisonResult({ scoreDiff: 0.05 });
      const result = gate.customFn?.(results, comparison);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('5.0%');
    });

    it('should fail when no comparison provided', () => {
      const gate = createImprovementGate(0);
      const result = gate.customFn?.(results, undefined);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('No comparison');
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
      expect(result.passed).toBe(true);
      expect(result.reason).toContain('significant');
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
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('not statistically significant');
    });

    it('should fail when no comparison provided', () => {
      const gate = createSignificanceGate(0.05);
      const result = gate.customFn?.(results, undefined);
      expect(result.passed).toBe(false);
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
      expect(result.passed).toBe(true);
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
      expect(result.passed).toBe(false);
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
      expect(result.passed).toBe(true);
    });

    it('should fail when metric not found in comparison', () => {
      const gate = createMetricRegressionGate('nonexistent', 0);
      const comparison = makeComparisonResult();
      const result = gate.customFn?.(results, comparison);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should fail when no comparison provided', () => {
      const gate = createMetricRegressionGate('faithfulness', 0);
      const result = gate.customFn?.(results, undefined);
      expect(result.passed).toBe(false);
    });
  });
});

describe('CI integration standalone functions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-ci-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSummary(): GateEvaluationSummary {
    return {
      runId: 'test-run-001',
      totalGates: 1,
      passedGates: 1,
      failedGates: 0,
      overallPassed: true,
      results: [
        {
          name: 'quality',
          passed: true,
          reason: 'passed',
          actualValue: 0.85,
          expectedValue: 0.8,
          type: 'threshold' as const,
        },
      ],
      durationMs: 100,
    };
  }

  describe('outputGitHubAnnotations', () => {
    it('should write annotations to stdout', () => {
      // eslint-disable-next-line no-console
      const originalLog = console.log;
      let logged = '';
      // eslint-disable-next-line no-console
      console.log = (msg: string): void => {
        logged += msg;
      };
      try {
        outputGitHubAnnotations(makeSummary());
        expect(logged).toContain('::notice');
      } finally {
        // eslint-disable-next-line no-console
        console.log = originalLog;
      }
    });
  });

  describe('setGitHubOutput', () => {
    it('should append key=value to the $GITHUB_OUTPUT file', () => {
      const outputFile = path.join(tmpDir, 'gh-output');
      fs.writeFileSync(outputFile, '');
      process.env.GITHUB_OUTPUT = outputFile;
      try {
        setGitHubOutput('mykey', 'myval');
        setGitHubOutput('other', 'value2');
        const content = fs.readFileSync(outputFile, 'utf-8');
        expect(content).toContain('mykey=myval');
        expect(content).toContain('other=value2');
      } finally {
        process.env.GITHUB_OUTPUT = undefined;
      }
    });

    it('should be a no-op when GITHUB_OUTPUT is not set', () => {
      process.env.GITHUB_OUTPUT = undefined;
      // Simply verify it does not throw
      expect(() => setGitHubOutput('mykey', 'myval')).not.toThrow();
    });
  });

  describe('exportForCI', () => {
    it('should write junit.xml, results.json, and pr-comment.md', async () => {
      await exportForCI(makeSummary(), tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'junit.xml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'results.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'pr-comment.md'))).toBe(true);

      const junit = fs.readFileSync(path.join(tmpDir, 'junit.xml'), 'utf-8');
      expect(junit).toContain('<?xml');

      const json = fs.readFileSync(path.join(tmpDir, 'results.json'), 'utf-8');
      expect(JSON.parse(json).runId).toBe('test-run-001');

      const comment = fs.readFileSync(path.join(tmpDir, 'pr-comment.md'), 'utf-8');
      expect(comment).toContain('Evaluation Gates');
    });
  });

  describe('writeJUnitReport', () => {
    it('should write JUnit XML to file', async () => {
      const filePath = path.join(tmpDir, 'junit-standalone.xml');
      await writeJUnitReport(makeSummary(), filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('<?xml');
      expect(content).toContain('<testsuite');
    });
  });
});
