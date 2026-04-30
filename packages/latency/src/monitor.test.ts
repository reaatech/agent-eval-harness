import type { Trajectory } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import {
  compareLatency,
  detectAnomalies,
  getComponentBreakdown,
  monitorLatency,
} from './monitor.js';
import type { LatencyResult } from './monitor.js';

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
    expect(result.turns[0]?.llmCallMs).toBe(400);
    expect(result.turns[0]?.toolInvocationMs).toBe(150);
    expect(result.turns[0]?.overheadMs).toBe(50);
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

    expect(result.turns[0]?.overheadMs).toBe(200);
  });

  it('should handle turns without latency_breakdown', () => {
    const trajectory = makeTrajectory([{ turn_id: 1, role: 'agent', latency_ms: 500 }]);

    const result = monitorLatency(trajectory);

    expect(result.turns[0]?.llmCallMs).toBeUndefined();
    expect(result.turns[0]?.toolInvocationMs).toBeUndefined();
    expect(result.turns[0]?.overheadMs).toBe(500);
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

    expect(result.turns[0]?.overheadMs).toBe(0);
  });

  it('should treat missing latency_ms as zero', () => {
    const trajectory: Trajectory = {
      turns: [{ turn_id: 1, role: 'agent', content: 'hi', timestamp: '2026-04-15T23:00:00Z' }],
    };

    const result = monitorLatency(trajectory);

    expect(result.turns[0]?.latencyMs).toBe(0);
    expect(result.totalLatencyMs).toBe(0);
  });

  it('should preserve turn metadata in TurnLatency', () => {
    const trajectory = makeTrajectory([{ turn_id: 42, role: 'agent', latency_ms: 300 }]);

    const result = monitorLatency(trajectory);

    expect(result.turns[0]?.turnId).toBe(42);
    expect(result.turns[0]?.timestamp).toBe('2026-04-15T23:00:00Z');
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
    expect(anomalies[0]?.turnId).toBe(3);
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
