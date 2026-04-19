import { describe, it, expect } from 'vitest';
import {
  monitorLatency,
  getComponentBreakdown,
  compareLatency,
  detectAnomalies,
} from '../../src/latency/monitor.js';
import type { LatencyResult } from '../../src/latency/monitor.js';
import {
  enforceBudget,
  createLatencyBudget,
  formatLatency,
} from '../../src/latency/budget-enforcer.js';
// BudgetEnforcementResult and LatencyBudget types used implicitly by enforceBudget
import { analyzeOptimization, LatencyTracker } from '../../src/latency/optimizer.js';
import type { Trajectory } from '../../src/types/domain.js';

function makeTurn(
  turn_id: number,
  role: 'user' | 'agent',
  latency_ms: number,
  timestamp = '2026-04-15T23:00:00Z',
  content = 'response',
  latency_breakdown?: { llm_call?: number; tool_invocation?: number },
): Trajectory['turns'][number] {
  return {
    turn_id,
    role,
    content,
    timestamp,
    latency_ms,
    ...(latency_breakdown ? { latency_breakdown } : {}),
  } as Trajectory['turns'][number];
}

function makeTrajectory(
  turns: Array<{
    turn_id: number;
    role: 'user' | 'agent';
    latency_ms: number;
    latency_breakdown?: { llm_call?: number; tool_invocation?: number };
  }>,
): Trajectory {
  return {
    turns: turns.map((t) =>
      makeTurn(
        t.turn_id,
        t.role,
        t.latency_ms,
        '2026-04-15T23:00:00Z',
        'content',
        t.latency_breakdown,
      ),
    ),
  };
}

function makeLatencyResult(overrides: Partial<LatencyResult> = {}): LatencyResult {
  return {
    turns: [],
    totalLatencyMs: 0,
    avgLatencyMs: 0,
    p50Ms: 0,
    p90Ms: 0,
    p99Ms: 0,
    maxLatencyMs: 0,
    minLatencyMs: 0,
    turnCount: 0,
    ...overrides,
  };
}

describe('monitorLatency', () => {
  it('should compute latency metrics from agent turns only', () => {
    const trajectory = makeTrajectory([
      { turn_id: 1, role: 'user', latency_ms: 100 },
      { turn_id: 1, role: 'agent', latency_ms: 500 },
      { turn_id: 2, role: 'user', latency_ms: 50 },
      { turn_id: 2, role: 'agent', latency_ms: 800 },
      { turn_id: 3, role: 'agent', latency_ms: 300 },
    ]);

    const result = monitorLatency(trajectory);

    expect(result.turnCount).toBe(3);
    expect(result.totalLatencyMs).toBe(1600);
    expect(result.avgLatencyMs).toBeCloseTo(533.33, 0);
    expect(result.minLatencyMs).toBe(300);
    expect(result.maxLatencyMs).toBe(800);
  });

  it('should compute percentiles correctly', () => {
    const trajectory = makeTrajectory([
      { turn_id: 1, role: 'agent', latency_ms: 200 },
      { turn_id: 2, role: 'agent', latency_ms: 400 },
      { turn_id: 3, role: 'agent', latency_ms: 600 },
      { turn_id: 4, role: 'agent', latency_ms: 800 },
      { turn_id: 5, role: 'agent', latency_ms: 1000 },
    ]);

    const result = monitorLatency(trajectory);

    expect(result.p50Ms).toBe(600);
    expect(result.turnCount).toBe(5);
  });

  it('should extract latency_breakdown components', () => {
    const trajectory = makeTrajectory([
      {
        turn_id: 1,
        role: 'agent',
        latency_ms: 600,
        latency_breakdown: { llm_call: 400, tool_invocation: 150 },
      },
    ]);

    const result = monitorLatency(trajectory);

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]!.llmCallMs).toBe(400);
    expect(result.turns[0]!.toolInvocationMs).toBe(150);
    expect(result.turns[0]!.overheadMs).toBe(50);
  });

  it('should compute overhead as total minus llm and tool', () => {
    const trajectory = makeTrajectory([
      {
        turn_id: 1,
        role: 'agent',
        latency_ms: 1000,
        latency_breakdown: { llm_call: 600, tool_invocation: 200 },
      },
    ]);

    const result = monitorLatency(trajectory);

    expect(result.turns[0]!.overheadMs).toBe(200);
  });

  it('should handle turns without latency_breakdown', () => {
    const trajectory = makeTrajectory([{ turn_id: 1, role: 'agent', latency_ms: 500 }]);

    const result = monitorLatency(trajectory);

    expect(result.turns[0]!.llmCallMs).toBeUndefined();
    expect(result.turns[0]!.toolInvocationMs).toBeUndefined();
    expect(result.turns[0]!.overheadMs).toBe(500);
  });

  it('should return zeroed metrics for trajectory with no agent turns', () => {
    const trajectory = makeTrajectory([
      { turn_id: 1, role: 'user', latency_ms: 100 },
      { turn_id: 2, role: 'user', latency_ms: 200 },
    ]);

    const result = monitorLatency(trajectory);

    expect(result.turnCount).toBe(0);
    expect(result.totalLatencyMs).toBe(0);
    expect(result.avgLatencyMs).toBe(0);
    expect(result.p50Ms).toBe(0);
    expect(result.p90Ms).toBe(0);
    expect(result.p99Ms).toBe(0);
    expect(result.maxLatencyMs).toBe(0);
    expect(result.minLatencyMs).toBe(0);
    expect(result.turns).toHaveLength(0);
  });

  it('should handle empty trajectory', () => {
    const trajectory: Trajectory = { turns: [] };
    const result = monitorLatency(trajectory);

    expect(result.turnCount).toBe(0);
    expect(result.totalLatencyMs).toBe(0);
  });

  it('should handle single agent turn', () => {
    const trajectory = makeTrajectory([{ turn_id: 1, role: 'agent', latency_ms: 750 }]);

    const result = monitorLatency(trajectory);

    expect(result.turnCount).toBe(1);
    expect(result.totalLatencyMs).toBe(750);
    expect(result.avgLatencyMs).toBe(750);
    expect(result.p50Ms).toBe(750);
    expect(result.p90Ms).toBe(750);
    expect(result.p99Ms).toBe(750);
    expect(result.maxLatencyMs).toBe(750);
    expect(result.minLatencyMs).toBe(750);
  });

  it('should clamp overhead to zero when breakdown exceeds total', () => {
    const trajectory = makeTrajectory([
      {
        turn_id: 1,
        role: 'agent',
        latency_ms: 100,
        latency_breakdown: { llm_call: 80, tool_invocation: 50 },
      },
    ]);

    const result = monitorLatency(trajectory);

    expect(result.turns[0]!.overheadMs).toBe(0);
  });

  it('should treat missing latency_ms as zero', () => {
    const trajectory: Trajectory = {
      turns: [{ turn_id: 1, role: 'agent', content: 'hi', timestamp: '2026-04-15T23:00:00Z' }],
    };

    const result = monitorLatency(trajectory);

    expect(result.turns[0]!.latencyMs).toBe(0);
    expect(result.totalLatencyMs).toBe(0);
  });

  it('should preserve turn metadata in TurnLatency', () => {
    const trajectory = makeTrajectory([{ turn_id: 42, role: 'agent', latency_ms: 300 }]);

    const result = monitorLatency(trajectory);

    expect(result.turns[0]!.turnId).toBe(42);
    expect(result.turns[0]!.timestamp).toBe('2026-04-15T23:00:00Z');
  });
});

describe('getComponentBreakdown', () => {
  it('should compute average and total component latencies', () => {
    const result = makeLatencyResult({
      turns: [
        {
          turnId: 1,
          latencyMs: 600,
          llmCallMs: 400,
          toolInvocationMs: 100,
          overheadMs: 100,
          timestamp: '',
        },
        {
          turnId: 2,
          latencyMs: 800,
          llmCallMs: 500,
          toolInvocationMs: 200,
          overheadMs: 100,
          timestamp: '',
        },
      ],
    });

    const breakdown = getComponentBreakdown(result);

    expect(breakdown.totalLlmCallMs).toBe(900);
    expect(breakdown.totalToolInvocationMs).toBe(300);
    expect(breakdown.totalOverheadMs).toBe(200);
    expect(breakdown.avgLlmCallMs).toBe(450);
    expect(breakdown.avgToolInvocationMs).toBe(150);
    expect(breakdown.avgOverheadMs).toBe(100);
  });

  it('should treat missing component values as zero', () => {
    const result = makeLatencyResult({
      turns: [
        { turnId: 1, latencyMs: 500, timestamp: '' },
        { turnId: 2, latencyMs: 300, timestamp: '' },
      ],
    });

    const breakdown = getComponentBreakdown(result);

    expect(breakdown.totalLlmCallMs).toBe(0);
    expect(breakdown.totalToolInvocationMs).toBe(0);
    expect(breakdown.totalOverheadMs).toBe(0);
    expect(breakdown.avgLlmCallMs).toBe(0);
    expect(breakdown.avgToolInvocationMs).toBe(0);
    expect(breakdown.avgOverheadMs).toBe(0);
  });

  it('should handle empty turns gracefully', () => {
    const result = makeLatencyResult({ turns: [] });

    const breakdown = getComponentBreakdown(result);

    expect(breakdown.avgLlmCallMs).toBe(0);
    expect(breakdown.avgToolInvocationMs).toBe(0);
    expect(breakdown.avgOverheadMs).toBe(0);
  });
});

describe('compareLatency', () => {
  it('should detect faster candidate', () => {
    const baseline = makeLatencyResult({ avgLatencyMs: 1000, p99Ms: 3000 });
    const candidate = makeLatencyResult({ avgLatencyMs: 800, p99Ms: 2500 });

    const diff = compareLatency(baseline, candidate);

    expect(diff.faster).toBe(true);
    expect(diff.avgDiffMs).toBe(-200);
    expect(diff.p99DiffMs).toBe(-500);
    expect(diff.percentageChange).toBeLessThan(0);
  });

  it('should detect slower candidate', () => {
    const baseline = makeLatencyResult({ avgLatencyMs: 500, p99Ms: 1000 });
    const candidate = makeLatencyResult({ avgLatencyMs: 700, p99Ms: 1500 });

    const diff = compareLatency(baseline, candidate);

    expect(diff.faster).toBe(false);
    expect(diff.avgDiffMs).toBe(200);
    expect(diff.p99DiffMs).toBe(500);
    expect(diff.percentageChange).toBeGreaterThan(0);
  });

  it('should handle identical results', () => {
    const baseline = makeLatencyResult({ avgLatencyMs: 1000, p99Ms: 2000 });
    const candidate = makeLatencyResult({ avgLatencyMs: 1000, p99Ms: 2000 });

    const diff = compareLatency(baseline, candidate);

    expect(diff.faster).toBe(false);
    expect(diff.avgDiffMs).toBe(0);
    expect(diff.p99DiffMs).toBe(0);
    expect(diff.percentageChange).toBe(0);
  });

  it('should handle zero baseline with positive candidate', () => {
    const baseline = makeLatencyResult({ avgLatencyMs: 0, p99Ms: 0 });
    const candidate = makeLatencyResult({ avgLatencyMs: 500, p99Ms: 1000 });

    const diff = compareLatency(baseline, candidate);

    expect(diff.percentageChange).toBe(100);
    expect(diff.faster).toBe(false);
  });

  it('should handle zero baseline with zero candidate', () => {
    const baseline = makeLatencyResult({ avgLatencyMs: 0, p99Ms: 0 });
    const candidate = makeLatencyResult({ avgLatencyMs: 0, p99Ms: 0 });

    const diff = compareLatency(baseline, candidate);

    expect(diff.percentageChange).toBe(0);
    expect(diff.faster).toBe(false);
  });
});

describe('detectAnomalies', () => {
  it('should detect turns exceeding the threshold multiplier', () => {
    const result = makeLatencyResult({
      avgLatencyMs: 500,
      turns: [
        { turnId: 1, latencyMs: 400, timestamp: '' },
        { turnId: 2, latencyMs: 500, timestamp: '' },
        { turnId: 3, latencyMs: 3000, timestamp: '' },
      ],
    });

    const anomalies = detectAnomalies(result);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.turnId).toBe(3);
  });

  it('should not flag turns below the 1000ms floor', () => {
    const result = makeLatencyResult({
      avgLatencyMs: 100,
      turns: [
        { turnId: 1, latencyMs: 50, timestamp: '' },
        { turnId: 2, latencyMs: 300, timestamp: '' },
        { turnId: 3, latencyMs: 250, timestamp: '' },
      ],
    });

    const anomalies = detectAnomalies(result);

    expect(anomalies).toHaveLength(0);
  });

  it('should respect custom threshold multiplier', () => {
    const result = makeLatencyResult({
      avgLatencyMs: 500,
      turns: [
        { turnId: 1, latencyMs: 400, timestamp: '' },
        { turnId: 2, latencyMs: 1200, timestamp: '' },
        { turnId: 3, latencyMs: 2500, timestamp: '' },
      ],
    });

    const anomaliesDefault = detectAnomalies(result);
    const anomaliesLenient = detectAnomalies(result, 5);

    expect(anomaliesDefault.length).toBeGreaterThanOrEqual(anomaliesLenient.length);
  });

  it('should return empty array when no anomalies exist', () => {
    const result = makeLatencyResult({
      avgLatencyMs: 1000,
      turns: [
        { turnId: 1, latencyMs: 800, timestamp: '' },
        { turnId: 2, latencyMs: 900, timestamp: '' },
        { turnId: 3, latencyMs: 1000, timestamp: '' },
      ],
    });

    const anomalies = detectAnomalies(result);

    expect(anomalies).toHaveLength(0);
  });

  it('should use default multiplier of 2', () => {
    const result = makeLatencyResult({
      avgLatencyMs: 600,
      turns: [
        { turnId: 1, latencyMs: 1300, timestamp: '' },
        { turnId: 2, latencyMs: 1500, timestamp: '' },
      ],
    });

    const anomalies = detectAnomalies(result);
    const explicit = detectAnomalies(result, 2);

    expect(anomalies).toEqual(explicit);
  });
});

describe('enforceBudget', () => {
  it('should pass when all metrics are within budget', () => {
    const result = makeLatencyResult({
      p50Ms: 400,
      p90Ms: 800,
      p99Ms: 1500,
      maxLatencyMs: 2000,
      totalLatencyMs: 5000,
      turns: [{ turnId: 1, latencyMs: 400, timestamp: '' }],
    });

    const enforcement = enforceBudget(result, {
      p50: 1000,
      p90: 2000,
      p99: 5000,
      maxTurn: 3000,
      total: 10000,
    });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.violations).toHaveLength(0);
  });

  it('should fail when P50 exceeds budget', () => {
    const result = makeLatencyResult({ p50Ms: 1200 });

    const enforcement = enforceBudget(result, { p50: 1000 });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations).toHaveLength(1);
    expect(enforcement.violations[0]!.type).toBe('p50_exceeded');
    expect(enforcement.violations[0]!.actual).toBe(1200);
    expect(enforcement.violations[0]!.threshold).toBe(1000);
  });

  it('should fail when P99 exceeds budget', () => {
    const result = makeLatencyResult({ p99Ms: 6000 });

    const enforcement = enforceBudget(result, { p99: 5000 });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]!.type).toBe('p99_exceeded');
    expect(enforcement.violations[0]!.severity).toBe('critical');
  });

  it('should fail when max turn latency exceeds budget', () => {
    const result = makeLatencyResult({
      maxLatencyMs: 4000,
      turns: [
        { turnId: 5, latencyMs: 4000, timestamp: '' },
        { turnId: 1, latencyMs: 200, timestamp: '' },
      ],
    });

    const enforcement = enforceBudget(result, { maxTurn: 3000 });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]!.type).toBe('max_turn_exceeded');
    expect(enforcement.violations[0]!.turnId).toBe(5);
  });

  it('should fail when total latency exceeds budget', () => {
    const result = makeLatencyResult({ totalLatencyMs: 35000 });

    const enforcement = enforceBudget(result, { total: 30000 });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]!.type).toBe('total_exceeded');
  });

  it('should check component budgets', () => {
    const result = makeLatencyResult({
      turns: [
        { turnId: 1, latencyMs: 600, llmCallMs: 900, timestamp: '' },
        { turnId: 2, latencyMs: 600, llmCallMs: 950, timestamp: '' },
      ],
    });

    const enforcement = enforceBudget(result, {
      components: { llmCall: 500 },
    });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]!.type).toBe('llm_call_exceeded');
  });

  it('should check tool invocation component budget', () => {
    const result = makeLatencyResult({
      turns: [
        { turnId: 1, latencyMs: 600, toolInvocationMs: 300, timestamp: '' },
        { turnId: 2, latencyMs: 600, toolInvocationMs: 350, timestamp: '' },
      ],
    });

    const enforcement = enforceBudget(result, {
      components: { toolInvocation: 200 },
    });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]!.type).toBe('tool_invocation_exceeded');
  });

  it('should check overhead component budget', () => {
    const result = makeLatencyResult({
      turns: [
        { turnId: 1, latencyMs: 600, overheadMs: 250, timestamp: '' },
        { turnId: 2, latencyMs: 600, overheadMs: 300, timestamp: '' },
      ],
    });

    const enforcement = enforceBudget(result, {
      components: { overhead: 100 },
    });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]!.type).toBe('overhead_exceeded');
  });

  it('should produce warnings when approaching thresholds', () => {
    const result = makeLatencyResult({ p50Ms: 850 });

    const enforcement = enforceBudget(result, { p50: 1000 });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.warnings.length).toBeGreaterThan(0);
    expect(enforcement.warnings[0]!.type).toBe('p50_exceeded');
  });

  it('should produce warnings for P90 approaching threshold', () => {
    const result = makeLatencyResult({ p90Ms: 1700 });

    const enforcement = enforceBudget(result, { p90: 2000 });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.warnings).toHaveLength(1);
    expect(enforcement.warnings[0]!.severity).toBe('medium');
  });

  it('should produce warnings for P99 approaching threshold', () => {
    const result = makeLatencyResult({ p99Ms: 4200 });

    const enforcement = enforceBudget(result, { p99: 5000 });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.warnings).toHaveLength(1);
    expect(enforcement.warnings[0]!.severity).toBe('high');
  });

  it('should calculate score as 1.0 when no violations or warnings', () => {
    const result = makeLatencyResult({ p50Ms: 200 });

    const enforcement = enforceBudget(result, { p50: 1000 });

    expect(enforcement.score).toBe(1.0);
  });

  it('should reduce score for violations', () => {
    const result = makeLatencyResult({
      p50Ms: 2000,
      p90Ms: 3000,
      p99Ms: 8000,
    });

    const enforcement = enforceBudget(result, {
      p50: 1000,
      p90: 2000,
      p99: 5000,
    });

    expect(enforcement.score).toBeLessThan(1.0);
    expect(enforcement.score).toBeGreaterThanOrEqual(0);
  });

  it('should not apply violations for unspecified budget keys', () => {
    const result = makeLatencyResult({
      p50Ms: 5000,
      p90Ms: 8000,
      p99Ms: 12000,
    });

    const enforcement = enforceBudget(result, { p50: 1000 });

    expect(enforcement.violations).toHaveLength(1);
    expect(enforcement.violations[0]!.type).toBe('p50_exceeded');
  });

  it('should handle empty budget', () => {
    const result = makeLatencyResult({ p50Ms: 9999 });

    const enforcement = enforceBudget(result, {});

    expect(enforcement.passed).toBe(true);
    expect(enforcement.violations).toHaveLength(0);
  });
});

describe('createLatencyBudget', () => {
  it('should create strict budget', () => {
    const budget = createLatencyBudget('strict');

    expect(budget.p50).toBe(500);
    expect(budget.p90).toBe(1000);
    expect(budget.p99).toBe(2000);
    expect(budget.maxTurn).toBe(3000);
    expect(budget.total).toBe(15000);
    expect(budget.components?.llmCall).toBe(400);
    expect(budget.components?.toolInvocation).toBe(100);
    expect(budget.components?.overhead).toBe(50);
  });

  it('should create moderate budget', () => {
    const budget = createLatencyBudget('moderate');

    expect(budget.p50).toBe(1000);
    expect(budget.p90).toBe(2000);
    expect(budget.p99).toBe(5000);
    expect(budget.maxTurn).toBe(8000);
    expect(budget.total).toBe(30000);
    expect(budget.components?.llmCall).toBe(800);
    expect(budget.components?.toolInvocation).toBe(200);
    expect(budget.components?.overhead).toBe(100);
  });

  it('should create lenient budget', () => {
    const budget = createLatencyBudget('lenient');

    expect(budget.p50).toBe(2000);
    expect(budget.p90).toBe(4000);
    expect(budget.p99).toBe(10000);
    expect(budget.maxTurn).toBe(15000);
    expect(budget.total).toBe(60000);
    expect(budget.components?.llmCall).toBe(1500);
    expect(budget.components?.toolInvocation).toBe(500);
    expect(budget.components?.overhead).toBe(200);
  });

  it('should have progressively looser thresholds across presets', () => {
    const strict = createLatencyBudget('strict');
    const moderate = createLatencyBudget('moderate');
    const lenient = createLatencyBudget('lenient');

    expect(strict.p99!).toBeLessThan(moderate.p99!);
    expect(moderate.p99!).toBeLessThan(lenient.p99!);
    expect(strict.total!).toBeLessThan(moderate.total!);
    expect(moderate.total!).toBeLessThan(lenient.total!);
  });
});

describe('formatLatency', () => {
  it('should format milliseconds', () => {
    expect(formatLatency(50)).toBe('50ms');
    expect(formatLatency(999)).toBe('999ms');
    expect(formatLatency(0)).toBe('0ms');
  });

  it('should format seconds', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(5000)).toBe('5.0s');
    expect(formatLatency(59999)).toBe('60.0s');
  });

  it('should format minutes', () => {
    expect(formatLatency(60000)).toBe('1.0m');
    expect(formatLatency(120000)).toBe('2.0m');
    expect(formatLatency(90000)).toBe('1.5m');
  });
});

describe('analyzeOptimization', () => {
  it('should identify LLM call bottlenecks', () => {
    const result = makeLatencyResult({
      p99Ms: 1000,
      turns: [
        { turnId: 1, latencyMs: 2500, llmCallMs: 2200, timestamp: '' },
        { turnId: 2, latencyMs: 2000, llmCallMs: 1800, timestamp: '' },
        { turnId: 3, latencyMs: 1800, llmCallMs: 1500, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    expect(optimization.bottlenecks.length).toBeGreaterThan(0);
    expect(optimization.bottlenecks[0]!.type).toBe('llm_call');
    expect(optimization.bottlenecks[0]!.severity).toBeGreaterThan(0);
    expect(optimization.bottlenecks[0]!.avgLatencyMs).toBeGreaterThan(1000);
  });

  it('should identify tool invocation bottlenecks', () => {
    const result = makeLatencyResult({
      p99Ms: 1000,
      turns: [
        { turnId: 1, latencyMs: 800, toolInvocationMs: 600, timestamp: '' },
        { turnId: 2, latencyMs: 900, toolInvocationMs: 700, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    const toolBottleneck = optimization.bottlenecks.find((b) => b.type === 'tool_invocation');
    expect(toolBottleneck).toBeDefined();
  });

  it('should identify overhead bottlenecks', () => {
    const result = makeLatencyResult({
      p99Ms: 1000,
      turns: [
        { turnId: 1, latencyMs: 600, overheadMs: 400, timestamp: '' },
        { turnId: 2, latencyMs: 700, overheadMs: 500, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    const overheadBottleneck = optimization.bottlenecks.find((b) => b.type === 'overhead');
    expect(overheadBottleneck).toBeDefined();
  });

  it('should identify total latency bottleneck when p99 exceeds 5000ms', () => {
    const result = makeLatencyResult({
      p99Ms: 8000,
      turns: [
        { turnId: 1, latencyMs: 7000, timestamp: '' },
        { turnId: 2, latencyMs: 8000, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    const totalBottleneck = optimization.bottlenecks.find((b) => b.type === 'total');
    expect(totalBottleneck).toBeDefined();
    expect(totalBottleneck!.severity).toBeGreaterThan(0);
  });

  it('should return score 1.0 when no bottlenecks exist', () => {
    const result = makeLatencyResult({
      p99Ms: 500,
      turns: [
        { turnId: 1, latencyMs: 200, llmCallMs: 100, toolInvocationMs: 50, timestamp: '' },
        { turnId: 2, latencyMs: 300, llmCallMs: 150, toolInvocationMs: 50, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    expect(optimization.bottlenecks).toHaveLength(0);
    expect(optimization.score).toBe(1.0);
  });

  it('should generate recommendations for bottlenecks', () => {
    const result = makeLatencyResult({
      p99Ms: 8000,
      turns: [
        { turnId: 1, latencyMs: 3000, llmCallMs: 2500, timestamp: '' },
        { turnId: 2, latencyMs: 3500, llmCallMs: 3000, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    expect(optimization.recommendations.length).toBeGreaterThan(0);
    expect(optimization.estimatedImprovementMs).toBeGreaterThan(0);
  });

  it('should recommend reducing turns for long trajectories', () => {
    const result = makeLatencyResult({
      p99Ms: 500,
      turns: Array.from({ length: 4 }, (_, i) => ({
        turnId: i + 1,
        latencyMs: 200,
        timestamp: '',
      })),
    });
    const trajectory: Trajectory = {
      turns: Array.from({ length: 8 }, (_, i) => ({
        turn_id: i + 1,
        role: 'agent' as const,
        content: 'x',
        timestamp: '2026-04-15T23:00:00Z',
      })),
    };

    const optimization = analyzeOptimization(result, trajectory);

    const reduceTurnsRec = optimization.recommendations.find((r) => r.type === 'reduce_turns');
    expect(reduceTurnsRec).toBeDefined();
    expect(reduceTurnsRec!.expectedImprovementMs).toBe(800);
  });

  it('should sort bottlenecks by severity descending', () => {
    const result = makeLatencyResult({
      p99Ms: 8000,
      turns: [
        {
          turnId: 1,
          latencyMs: 3000,
          llmCallMs: 2500,
          toolInvocationMs: 300,
          overheadMs: 300,
          timestamp: '',
        },
      ],
    });

    const optimization = analyzeOptimization(result);

    for (let i = 1; i < optimization.bottlenecks.length; i++) {
      expect(optimization.bottlenecks[i - 1]!.severity).toBeGreaterThanOrEqual(
        optimization.bottlenecks[i]!.severity,
      );
    }
  });

  it('should sort recommendations by priority', () => {
    const result = makeLatencyResult({
      p99Ms: 8000,
      turns: [{ turnId: 1, latencyMs: 4000, llmCallMs: 3500, timestamp: '' }],
    });

    const optimization = analyzeOptimization(result);

    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < optimization.recommendations.length; i++) {
      expect(priorityOrder[optimization.recommendations[i - 1]!.priority]).toBeLessThanOrEqual(
        priorityOrder[optimization.recommendations[i]!.priority],
      );
    }
  });

  it('should not generate duplicate recommendation types', () => {
    const result = makeLatencyResult({
      p99Ms: 8000,
      turns: [
        { turnId: 1, latencyMs: 4000, llmCallMs: 3500, toolInvocationMs: 300, timestamp: '' },
        { turnId: 2, latencyMs: 3500, llmCallMs: 3000, toolInvocationMs: 250, timestamp: '' },
      ],
    });

    const optimization = analyzeOptimization(result);

    const types = optimization.recommendations.map((r) => r.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('should estimate improvement from top 3 recommendations', () => {
    const result = makeLatencyResult({
      p99Ms: 8000,
      turns: [{ turnId: 1, latencyMs: 4000, llmCallMs: 3500, timestamp: '' }],
    });

    const optimization = analyzeOptimization(result);

    const top3Improvement = optimization.recommendations
      .slice(0, 3)
      .reduce((sum, r) => sum + (r.expectedImprovementMs || 0), 0);
    expect(optimization.estimatedImprovementMs).toBeCloseTo(top3Improvement, 1);
  });
});

describe('LatencyTracker', () => {
  it('should record latency results', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );

    expect(tracker.getHistory()).toHaveLength(1);
  });

  it('should return empty history for new tracker', () => {
    const tracker = new LatencyTracker();

    expect(tracker.getHistory()).toHaveLength(0);
  });

  it('should return default trend with fewer than 2 records', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );

    const trend = tracker.getTrend();

    expect(trend.improving).toBe(true);
    expect(trend.improvementRate).toBe(0);
  });

  it('should detect improving trend', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 8000,
        turns: [{ turnId: 1, latencyMs: 4000, llmCallMs: 3500, timestamp: '' }],
      }),
    );
    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, llmCallMs: 150, timestamp: '' }],
      }),
    );
    tracker.record(
      makeLatencyResult({
        p99Ms: 400,
        turns: [{ turnId: 1, latencyMs: 150, llmCallMs: 100, timestamp: '' }],
      }),
    );

    const trend = tracker.getTrend();

    expect(trend.improving).toBe(true);
    expect(trend.improvementRate).toBeGreaterThan(0);
  });

  it('should detect degrading trend', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );
    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );
    tracker.record(
      makeLatencyResult({
        p99Ms: 8000,
        turns: [{ turnId: 1, latencyMs: 4000, llmCallMs: 3500, timestamp: '' }],
      }),
    );

    const trend = tracker.getTrend();

    expect(trend.improving).toBe(false);
    expect(trend.improvementRate).toBeLessThan(0);
  });

  it('should compute average score', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );
    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );

    const avg = tracker.getAverageScore();

    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThanOrEqual(1);
  });

  it('should return 1.0 average score for empty tracker', () => {
    const tracker = new LatencyTracker();

    expect(tracker.getAverageScore()).toBe(1.0);
  });

  it('should return a copy of history', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );

    const history1 = tracker.getHistory();
    const history2 = tracker.getHistory();

    expect(history1).not.toBe(history2);
    expect(history1).toEqual(history2);
  });

  it('should include timestamp and score in history entries', () => {
    const tracker = new LatencyTracker();

    tracker.record(
      makeLatencyResult({
        p99Ms: 500,
        turns: [{ turnId: 1, latencyMs: 200, timestamp: '' }],
      }),
    );

    const history = tracker.getHistory();

    expect(history[0]!.timestamp).toBeDefined();
    expect(typeof history[0]!.score).toBe('number');
    expect(history[0]!.result).toBeDefined();
  });
});
