import { describe, expect, it } from 'vitest';
import { createLatencyBudget, enforceBudget, formatLatency } from './budget-enforcer.js';
import type { LatencyResult } from './monitor.js';

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
    expect(enforcement.violations[0]?.type).toBe('p50_exceeded');
    expect(enforcement.violations[0]?.actual).toBe(1200);
    expect(enforcement.violations[0]?.threshold).toBe(1000);
  });

  it('should fail when P99 exceeds budget', () => {
    const result = makeLatencyResult({ p99Ms: 6000 });

    const enforcement = enforceBudget(result, { p99: 5000 });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]?.type).toBe('p99_exceeded');
    expect(enforcement.violations[0]?.severity).toBe('critical');
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
    expect(enforcement.violations[0]?.type).toBe('max_turn_exceeded');
    expect(enforcement.violations[0]?.turnId).toBe(5);
  });

  it('should fail when total latency exceeds budget', () => {
    const result = makeLatencyResult({ totalLatencyMs: 35000 });

    const enforcement = enforceBudget(result, { total: 30000 });

    expect(enforcement.passed).toBe(false);
    expect(enforcement.violations[0]?.type).toBe('total_exceeded');
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
    expect(enforcement.violations[0]?.type).toBe('llm_call_exceeded');
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
    expect(enforcement.violations[0]?.type).toBe('tool_invocation_exceeded');
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
    expect(enforcement.violations[0]?.type).toBe('overhead_exceeded');
  });

  it('should produce warnings when approaching thresholds', () => {
    const result = makeLatencyResult({ p50Ms: 850 });

    const enforcement = enforceBudget(result, { p50: 1000 });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.warnings.length).toBeGreaterThan(0);
    expect(enforcement.warnings[0]?.type).toBe('p50_exceeded');
  });

  it('should produce warnings for P90 approaching threshold', () => {
    const result = makeLatencyResult({ p90Ms: 1700 });

    const enforcement = enforceBudget(result, { p90: 2000 });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.warnings).toHaveLength(1);
    expect(enforcement.warnings[0]?.severity).toBe('medium');
  });

  it('should produce warnings for P99 approaching threshold', () => {
    const result = makeLatencyResult({ p99Ms: 4200 });

    const enforcement = enforceBudget(result, { p99: 5000 });

    expect(enforcement.passed).toBe(true);
    expect(enforcement.warnings).toHaveLength(1);
    expect(enforcement.warnings[0]?.severity).toBe('high');
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
    expect(enforcement.violations[0]?.type).toBe('p50_exceeded');
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

    expect(strict.p99 as number).toBeLessThan(moderate.p99 as number);
    expect(moderate.p99 as number).toBeLessThan(lenient.p99 as number);
    expect(strict.total as number).toBeLessThan(moderate.total as number);
    expect(moderate.total as number).toBeLessThan(lenient.total as number);
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
