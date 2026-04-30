import type { Trajectory } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import type { LatencyResult } from './monitor.js';
import { LatencyTracker, analyzeOptimization } from './optimizer.js';

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
    expect(optimization.bottlenecks[0]?.type).toBe('llm_call');
    expect(optimization.bottlenecks[0]?.severity).toBeGreaterThan(0);
    expect(optimization.bottlenecks[0]?.avgLatencyMs).toBeGreaterThan(1000);
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
    expect(totalBottleneck?.severity).toBeGreaterThan(0);
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
    expect(reduceTurnsRec?.expectedImprovementMs).toBe(800);
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
      const prev = optimization.bottlenecks[i - 1]?.severity ?? 0;
      const curr = optimization.bottlenecks[i]?.severity ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
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
      const prevPriority =
        priorityOrder[
          optimization.recommendations[i - 1]?.priority as keyof typeof priorityOrder
        ] ?? 0;
      const currPriority =
        priorityOrder[optimization.recommendations[i]?.priority as keyof typeof priorityOrder] ?? 0;
      expect(prevPriority).toBeLessThanOrEqual(currPriority);
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

    expect(history[0]?.timestamp).toBeDefined();
    expect(typeof history[0]?.score).toBe('number');
    expect(history[0]?.result).toBeDefined();
  });
});
