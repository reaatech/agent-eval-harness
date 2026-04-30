import { beforeEach, describe, expect, it } from 'vitest';
import { JudgeCostTracker, estimateOutputTokens, estimateTokens } from './cost-tracker.js';

describe('JudgeCostTracker', () => {
  let tracker: JudgeCostTracker;

  beforeEach(() => {
    tracker = new JudgeCostTracker();
  });

  describe('constructor', () => {
    it('should create tracker with default config', () => {
      const t = new JudgeCostTracker();
      expect(t).toBeDefined();
      expect(t.getTotalCost()).toBe(0);
    });

    it('should accept budget limit', () => {
      const t = new JudgeCostTracker({ budgetLimit: 10.0 });
      expect(t.getRemainingBudget()).toBe(10.0);
    });

    it('should accept custom pricing', () => {
      const t = new JudgeCostTracker({
        pricing: {
          claude: { input: 20.0, output: 80.0 },
          gpt4: { input: 15.0, output: 45.0 },
          gemini: { input: 3.0, output: 9.0 },
          openrouter: { input: 6.0, output: 18.0 },
        },
      });
      expect(t).toBeDefined();
    });
  });

  describe('recordJudgment', () => {
    it('should record a judgment cost', () => {
      const result = tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);

      expect(result.cost).toBeGreaterThan(0);
      expect(result.alerts).toBeDefined();
      expect(result.alerts).toHaveLength(0);
    });

    it('should calculate cost based on pricing', () => {
      const result = tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);

      const expectedCost = (1000 * 15.0 + 500 * 75.0) / 1_000_000;
      expect(result.cost).toBeCloseTo(expectedCost, 4);
    });

    it('should track total cost across judgments', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'claude', 'claude-opus', 2000, 1000);

      const total = tracker.getTotalCost();
      expect(total).toBeGreaterThan(0);
    });

    it('should trigger budget alerts', () => {
      const t = new JudgeCostTracker({ budgetLimit: 0.001, alertThresholds: [0.5] });
      const result = t.recordJudgment('j1', 'claude', 'claude-opus', 10000, 5000);

      expect(result.alerts.length).toBeGreaterThan(0);
    });

    it('should trigger max cost per judgment alert', () => {
      const t = new JudgeCostTracker({ maxCostPerJudgment: 0.0001 });
      const result = t.recordJudgment('j1', 'claude', 'claude-opus', 10000, 5000);

      expect(result.alerts.some((a) => a.level === 'warning')).toBe(true);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for a provider', () => {
      const cost = tracker.estimateCost('claude', 1000, 500);

      expect(cost).toBeGreaterThan(0);
      const expected = (1000 * 15.0 + 500 * 75.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected, 4);
    });

    it('should return different costs for different providers', () => {
      const claudeCost = tracker.estimateCost('claude', 1000, 500);
      const geminiCost = tracker.estimateCost('gemini', 1000, 500);

      expect(claudeCost).not.toBe(geminiCost);
    });
  });

  describe('canAfford', () => {
    it('should allow when no budget limit set', () => {
      const result = tracker.canAfford(100);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow when within budget', () => {
      const t = new JudgeCostTracker({ budgetLimit: 1.0 });
      const result = t.canAfford(0.01);

      expect(result.allowed).toBe(true);
    });

    it('should block when over budget', () => {
      const t = new JudgeCostTracker({ budgetLimit: 0.0001 });
      t.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      const result = t.canAfford(1.0);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('getBreakdown', () => {
    it('should return empty breakdown initially', () => {
      const breakdown = tracker.getBreakdown();

      expect(breakdown.totalCost).toBe(0);
      expect(breakdown.totalInputTokens).toBe(0);
      expect(breakdown.totalOutputTokens).toBe(0);
      expect(breakdown.judgmentCount).toBe(0);
      expect(breakdown.avgCostPerJudgment).toBe(0);
    });

    it('should return accurate breakdown after recordings', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'gpt4', 'gpt-4', 2000, 1000);

      const breakdown = tracker.getBreakdown();

      expect(breakdown.totalCost).toBeGreaterThan(0);
      expect(breakdown.totalInputTokens).toBe(3000);
      expect(breakdown.totalOutputTokens).toBe(1500);
      expect(breakdown.judgmentCount).toBe(2);
      expect(breakdown.avgCostPerJudgment).toBeGreaterThan(0);
      expect(breakdown.costByProvider.claude).toBeGreaterThan(0);
      expect(breakdown.costByProvider.gpt4).toBeGreaterThan(0);
    });

    it('should report budget usage percentage', () => {
      const t = new JudgeCostTracker({ budgetLimit: 1.0 });
      t.recordJudgment('j1', 'claude', 'claude-opus', 10000, 5000);

      const breakdown = t.getBreakdown();
      expect(breakdown.budgetUsagePercentage).toBeGreaterThan(0);
    });

    it('should report zero budget usage when no limit set', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      const breakdown = tracker.getBreakdown();
      expect(breakdown.budgetUsagePercentage).toBe(0);
    });
  });

  describe('getJudgments', () => {
    it('should return empty array initially', () => {
      expect(tracker.getJudgments()).toHaveLength(0);
    });

    it('should return all recorded judgments', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'gpt4', 'gpt-4', 2000, 1000);

      const judgments = tracker.getJudgments();
      expect(judgments).toHaveLength(2);
      expect(judgments[0]?.judgmentId).toBe('j1');
      expect(judgments[1]?.judgmentId).toBe('j2');
    });
  });

  describe('getTotalCost', () => {
    it('should return 0 initially', () => {
      expect(tracker.getTotalCost()).toBe(0);
    });

    it('should accumulate costs', () => {
      const r1 = tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      const r2 = tracker.recordJudgment('j2', 'claude', 'claude-opus', 1000, 500);

      expect(tracker.getTotalCost()).toBeCloseTo(r1.cost + r2.cost, 4);
    });
  });

  describe('reset', () => {
    it('should reset all tracking data', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'claude', 'claude-opus', 2000, 1000);

      tracker.reset();

      expect(tracker.getTotalCost()).toBe(0);
      expect(tracker.getJudgments()).toHaveLength(0);
    });
  });

  describe('getRemainingBudget', () => {
    it('should return Infinity when no budget set', () => {
      expect(tracker.getRemainingBudget()).toBe(Number.POSITIVE_INFINITY);
    });

    it('should return remaining budget', () => {
      const t = new JudgeCostTracker({ budgetLimit: 1.0 });
      const r = t.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);

      const remaining = t.getRemainingBudget();
      expect(remaining).toBeCloseTo(1.0 - r.cost, 4);
    });
  });

  describe('getOptimizationRecommendations', () => {
    it('should return empty array when no issues', () => {
      expect(tracker.getOptimizationRecommendations()).toHaveLength(0);
    });

    it('should recommend optimization when budget usage is high', () => {
      const t = new JudgeCostTracker({ budgetLimit: 0.001 });
      t.recordJudgment('j1', 'claude', 'claude-opus', 100000, 50000);

      const recs = t.getOptimizationRecommendations();
      expect(recs.length).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens from text', () => {
      const tokens = estimateTokens('Hello world');
      expect(tokens).toBe(Math.ceil('Hello world'.length / 4));
    });

    it('should return at least 1 for non-empty text', () => {
      const tokens = estimateTokens('a');
      expect(tokens).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('estimateOutputTokens', () => {
    it('should return a positive number', () => {
      const tokens = estimateOutputTokens('faithfulness');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return consistent values regardless of type', () => {
      const t1 = estimateOutputTokens('faithfulness');
      const t2 = estimateOutputTokens('relevance');
      expect(t1).toBe(t2);
    });
  });
});
