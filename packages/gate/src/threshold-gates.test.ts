import {
  buildThresholdGates,
  createCostGate,
  createFaithfulnessGate,
  createGateEngine,
  createLatencyGate,
  createOverallQualityGate,
  createPassRateGate,
  createRelevanceGate,
  createSLAViolationsGate,
  createToolCorrectnessGate,
  getLenientPreset,
  getStandardPreset,
  getStrictPreset,
} from '@reaatech/agent-eval-harness-gate';
import type { AggregatedResults, MetricBreakdown } from '@reaatech/agent-eval-harness-suite';
import { describe, expect, it } from 'vitest';

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
