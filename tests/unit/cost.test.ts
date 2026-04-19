import { describe, it, expect } from 'vitest';
import {
  calculateTurnCost,
  calculateTrajectoryCost,
  compareCosts,
  getCostPerMetric,
  DEFAULT_PRICING,
} from '../../src/cost/tracker.js';
import {
  checkBudget,
  getOptimizationRecommendations,
  createBudget,
  CostTracker,
} from '../../src/cost/budget-manager.js';
import type { BudgetConfig } from '../../src/cost/budget-manager.js';
import type { CostBreakdown } from '../../src/types/domain.js';
import {
  generateCostReport,
  exportToCsv,
  exportToJson,
  formatCost,
  generateSummary,
} from '../../src/cost/reporter.js';
import type { Trajectory, Turn } from '../../src/types/domain.js';

function makeTurn(
  overrides: Partial<Turn> & {
    turn_id: number;
    role: Turn['role'];
    content: string;
    timestamp: string;
  },
): Turn {
  return { ...overrides };
}

function makeTrajectory(overrides: Partial<Trajectory> & { turns: Turn[] }): Trajectory {
  return { ...overrides };
}

const agentTurn1: Turn = makeTurn({
  turn_id: 1,
  role: 'agent',
  content: 'I can help with that. What is your email?',
  timestamp: '2026-04-15T23:00:01Z',
  cost: { input_tokens: 150, output_tokens: 45 },
});

const agentTurn2: Turn = makeTurn({
  turn_id: 2,
  role: 'agent',
  content: 'Password reset sent!',
  timestamp: '2026-04-15T23:00:06Z',
  cost: { input_tokens: 120, output_tokens: 32 },
  tool_calls: [
    {
      name: 'send_reset_email',
      arguments: { email: 'john@example.com' },
      result: { status: 'sent' },
    },
  ],
});

const userTurn: Turn = makeTurn({
  turn_id: 3,
  role: 'user',
  content: 'john@example.com',
  timestamp: '2026-04-15T23:00:05Z',
});

const baseTrajectory: Trajectory = makeTrajectory({
  trajectory_id: 'traj-1',
  turns: [userTurn, agentTurn1, agentTurn2],
});

const baseTrajectoryNoTokens: Trajectory = makeTrajectory({
  trajectory_id: 'traj-no-tokens',
  turns: [
    makeTurn({ turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' }),
    makeTurn({
      turn_id: 2,
      role: 'agent',
      content: 'Hi there, how can I assist you today?',
      timestamp: '2026-04-15T23:00:01Z',
    }),
  ],
});

describe('DEFAULT_PRICING', () => {
  it('should contain known providers', () => {
    expect(DEFAULT_PRICING).toHaveProperty('claude-opus');
    expect(DEFAULT_PRICING).toHaveProperty('gpt-4-turbo');
    expect(DEFAULT_PRICING).toHaveProperty('gemini-pro');
  });

  it('should have input and output pricing for each provider', () => {
    for (const [_provider, pricing] of Object.entries(DEFAULT_PRICING)) {
      expect(typeof pricing.input).toBe('number');
      expect(typeof pricing.output).toBe('number');
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    }
  });
});

describe('calculateTurnCost', () => {
  it('should calculate cost for a turn with token data', () => {
    const result = calculateTurnCost(agentTurn1, 'claude-opus');

    expect(result.turn_id).toBe(1);
    expect(result.llm_cost).toBeGreaterThan(0);
    expect(result.total_cost).toBe(result.llm_cost + result.tool_cost);
    expect(result.input_tokens).toBe(150);
    expect(result.output_tokens).toBe(45);
  });

  it('should include tool costs when tool_calls are present', () => {
    const result = calculateTurnCost(agentTurn2, 'claude-opus');

    expect(result.tool_cost).toBeGreaterThan(0);
    expect(result.total_cost).toBe(result.llm_cost + result.tool_cost);
  });

  it('should have zero tool cost when no tool_calls', () => {
    const result = calculateTurnCost(agentTurn1, 'claude-opus');

    expect(result.tool_cost).toBe(0);
  });

  it('should use custom pricing when provided', () => {
    const customPricing = { 'my-model': { input: 5.0, output: 10.0 } };
    const turn: Turn = makeTurn({
      turn_id: 1,
      role: 'agent',
      content: 'test',
      timestamp: '2026-04-15T23:00:00Z',
      cost: { input_tokens: 1000, output_tokens: 500 },
    });

    const result = calculateTurnCost(turn, 'my-model', { customPricing });

    const expectedLlm = (1000 / 1_000_000) * 5.0 + (500 / 1_000_000) * 10.0;
    expect(result.llm_cost).toBe(Math.round(expectedLlm * 10000) / 10000);
  });

  it('should exclude tool costs when includeToolCosts is false', () => {
    const result = calculateTurnCost(agentTurn2, 'claude-opus', { includeToolCosts: false });

    expect(result.tool_cost).toBe(0);
  });

  it('should use custom toolInvocationCost', () => {
    const result = calculateTurnCost(agentTurn2, 'claude-opus', { toolInvocationCost: 0.001 });

    expect(result.tool_cost).toBe(0.001);
  });

  it('should estimate tokens from content when cost data is absent', () => {
    const turn: Turn = makeTurn({
      turn_id: 1,
      role: 'agent',
      content: 'This is a response with some content',
      timestamp: '2026-04-15T23:00:00Z',
    });

    const result = calculateTurnCost(turn, 'claude-opus');

    expect(result.input_tokens).toBeGreaterThan(0);
    expect(result.output_tokens).toBeGreaterThan(0);
    expect(result.llm_cost).toBeGreaterThan(0);
  });

  it('should throw for unknown provider', () => {
    expect(() => calculateTurnCost(agentTurn1, 'unknown-model')).toThrow(
      'Unknown provider: unknown-model',
    );
  });

  it('should throw for unknown provider without custom pricing', () => {
    expect(() => calculateTurnCost(agentTurn1, 'nonexistent', { customPricing: {} })).toThrow(
      'Unknown provider: nonexistent',
    );
  });

  it('should calculate different costs for different providers', () => {
    const resultOpus = calculateTurnCost(agentTurn1, 'claude-opus');
    const resultGPT = calculateTurnCost(agentTurn1, 'gpt-4-turbo');
    const resultGemini = calculateTurnCost(agentTurn1, 'gemini-pro');

    expect(resultOpus.llm_cost).not.toBe(resultGPT.llm_cost);
    expect(resultGPT.llm_cost).not.toBe(resultGemini.llm_cost);
    expect(resultOpus.llm_cost).toBeGreaterThan(resultGemini.llm_cost);
  });
});

describe('calculateTrajectoryCost', () => {
  it('should calculate total cost for a trajectory', () => {
    const result = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    expect(result.total_cost).toBeGreaterThan(0);
    expect(result.llm_cost).toBeGreaterThan(0);
    expect(result.total_cost).toBeCloseTo((result.llm_cost ?? 0) + (result.tool_cost ?? 0), 4);
  });

  it('should only include agent turns', () => {
    const result = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    expect(result.per_turn!.length).toBe(2);
    expect(result.per_turn!.every((tc) => tc.turn_id !== 3)).toBe(true);
  });

  it('should sum per-turn costs into totals', () => {
    const result = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const sumLlm = result.per_turn!.reduce((s, tc) => s + (tc.llm_cost ?? 0), 0);
    const sumTool = result.per_turn!.reduce((s, tc) => s + (tc.tool_cost ?? 0), 0);

    expect(result.llm_cost).toBe(Math.round(sumLlm * 10000) / 10000);
    expect(result.tool_cost).toBe(Math.round(sumTool * 10000) / 10000);
  });

  it('should track total input and output tokens', () => {
    const result = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    expect(result.input_tokens).toBe(150 + 120);
    expect(result.output_tokens).toBe(45 + 32);
  });

  it('should return zero cost for trajectory with no agent turns', () => {
    const traj: Trajectory = makeTrajectory({
      turns: [userTurn],
    });

    const result = calculateTrajectoryCost(traj, 'claude-opus');

    expect(result.total_cost).toBe(0);
    expect(result.per_turn!.length).toBe(0);
    expect(result.input_tokens).toBe(0);
    expect(result.output_tokens).toBe(0);
  });

  it('should estimate tokens for turns without explicit cost data', () => {
    const result = calculateTrajectoryCost(baseTrajectoryNoTokens, 'claude-opus');

    expect(result.total_cost).toBeGreaterThan(0);
    expect(result.input_tokens).toBeGreaterThan(0);
    expect(result.output_tokens).toBeGreaterThan(0);
  });

  it('should pass options through to calculateTurnCost', () => {
    const resultWithToolCosts = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const resultNoToolCosts = calculateTrajectoryCost(baseTrajectory, 'claude-opus', {
      includeToolCosts: false,
    });

    expect(resultNoToolCosts.tool_cost).toBe(0);
    expect(resultNoToolCosts.total_cost).toBeLessThan(resultWithToolCosts.total_cost);
  });
});

describe('compareCosts', () => {
  it('should identify when candidate is cheaper', () => {
    const baseline = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const candidate = calculateTrajectoryCost(baseTrajectory, 'gemini-pro');

    const result = compareCosts(baseline, candidate);

    expect(result.cheaper).toBe(true);
    expect(result.costDiff).toBeLessThan(0);
    expect(result.percentageChange).toBeLessThan(0);
  });

  it('should identify when candidate is more expensive', () => {
    const baseline = calculateTrajectoryCost(baseTrajectory, 'gemini-pro');
    const candidate = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = compareCosts(baseline, candidate);

    expect(result.cheaper).toBe(false);
    expect(result.costDiff).toBeGreaterThan(0);
    expect(result.percentageChange).toBeGreaterThan(0);
  });

  it('should handle identical costs', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = compareCosts(cost, cost);

    expect(result.costDiff).toBe(0);
    expect(result.percentageChange).toBe(0);
    expect(result.cheaper).toBe(false);
  });

  it('should handle zero baseline with positive candidate', () => {
    const zero: CostBreakdown = {
      total_cost: 0,
      llm_cost: 0,
      tool_cost: 0,
      per_turn: [],
      input_tokens: 0,
      output_tokens: 0,
    };
    const candidate = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = compareCosts(zero, candidate);

    expect(result.cheaper).toBe(false);
    expect(result.costDiff).toBeGreaterThan(0);
    expect(result.percentageChange).toBe(100);
  });

  it('should handle zero baseline with zero candidate', () => {
    const zero: CostBreakdown = {
      total_cost: 0,
      llm_cost: 0,
      tool_cost: 0,
      per_turn: [],
      input_tokens: 0,
      output_tokens: 0,
    };

    const result = compareCosts(zero, zero);

    expect(result.costDiff).toBe(0);
    expect(result.percentageChange).toBe(0);
    expect(result.cheaper).toBe(false);
  });
});

describe('getCostPerMetric', () => {
  it('should calculate cost per turn', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = getCostPerMetric(cost, 'turn', baseTrajectory);

    expect(result).toBe(cost.total_cost / 2);
  });

  it('should calculate cost per tool call', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = getCostPerMetric(cost, 'tool_call', baseTrajectory);

    expect(result).toBe(cost.total_cost / 1);
  });

  it('should return total cost for trajectory metric', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = getCostPerMetric(cost, 'trajectory', baseTrajectory);

    expect(result).toBe(cost.total_cost);
  });

  it('should return 0 for per-turn when no agent turns exist', () => {
    const traj: Trajectory = makeTrajectory({ turns: [userTurn] });
    const cost = calculateTrajectoryCost(traj, 'claude-opus');

    const result = getCostPerMetric(cost, 'turn', traj);

    expect(result).toBe(0);
  });

  it('should return 0 for per-tool-call when no tool calls exist', () => {
    const traj: Trajectory = makeTrajectory({
      turns: [
        makeTurn({
          turn_id: 1,
          role: 'agent',
          content: 'Hello',
          timestamp: '2026-04-15T23:00:00Z',
          cost: { input_tokens: 10, output_tokens: 5 },
        }),
      ],
    });
    const cost = calculateTrajectoryCost(traj, 'claude-opus');

    const result = getCostPerMetric(cost, 'tool_call', traj);

    expect(result).toBe(0);
  });
});

describe('checkBudget', () => {
  it('should pass when trajectory cost is under budget', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'gemini-pro');
    const budget: BudgetConfig = { perTrajectory: 1.0 };

    const result = checkBudget(cost, budget);

    expect(result.withinBudget).toBe(true);
    expect(result.currentCost).toBe(cost.total_cost);
    expect(result.budgetLimit).toBe(1.0);
    expect(result.usagePercentage).toBeGreaterThan(0);
    expect(result.usagePercentage).toBeLessThan(100);
  });

  it('should fail when trajectory cost exceeds budget', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget: BudgetConfig = { perTrajectory: 0.00001 };

    const result = checkBudget(cost, budget);

    expect(result.withinBudget).toBe(false);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.alerts.some((a) => a.level === 'error')).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should check per-task budget against individual turns', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const verySmallBudget: BudgetConfig = { perTask: 0.0000001 };

    const result = checkBudget(cost, verySmallBudget);

    expect(result.withinBudget).toBe(false);
    expect(result.alerts.some((a) => a.level === 'error')).toBe(true);
  });

  it('should pass per-task budget when all turns are within limit', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'gemini-pro');
    const budget: BudgetConfig = { perTask: 1.0 };

    const result = checkBudget(cost, budget);

    expect(result.withinBudget).toBe(true);
  });

  it('should return within budget when no budget constraints specified', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget: BudgetConfig = {};

    const result = checkBudget(cost, budget);

    expect(result.withinBudget).toBe(true);
    expect(result.alerts.length).toBe(0);
  });

  it('should trigger threshold alerts based on usage', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget: BudgetConfig = { perTrajectory: cost.total_cost * 1.1 };

    const result = checkBudget(cost, budget);

    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.usagePercentage).toBeGreaterThan(50);
  });

  it('should use custom thresholds', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget: BudgetConfig = { perTrajectory: cost.total_cost * 2 };
    const customThresholds = [{ threshold: 0.4, action: 'log' as const }];

    const result = checkBudget(cost, budget, customThresholds);

    expect(result.alerts.some((a) => a.action === 'log')).toBe(true);
  });

  it('should calculate usage percentage correctly', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget: BudgetConfig = { perTrajectory: cost.total_cost * 2 };

    const result = checkBudget(cost, budget);

    expect(result.usagePercentage).toBe(50);
  });
});

describe('getOptimizationRecommendations', () => {
  it('should recommend conciseness for high output/input ratio', () => {
    const cost = {
      total_cost: 0.01,
      llm_cost: 0.009,
      tool_cost: 0.001,
      per_turn: [
        {
          turn_id: 1,
          cost: 0.01,
          llm_cost: 0.009,
          tool_cost: 0.001,
          total_cost: 0.01,
          input_tokens: 100,
          output_tokens: 500,
        },
      ],
      input_tokens: 100,
      output_tokens: 500,
    };
    const traj: Trajectory = makeTrajectory({
      turns: [
        makeTurn({
          turn_id: 1,
          role: 'agent',
          content: 'short',
          timestamp: '2026-04-15T23:00:00Z',
        }),
      ],
    });

    const recs = getOptimizationRecommendations(cost, traj);

    expect(recs.some((r) => r.includes('concise'))).toBe(true);
  });

  it('should recommend batching when tool costs are significant', () => {
    const cost = {
      total_cost: 0.01,
      llm_cost: 0.005,
      tool_cost: 0.005,
      per_turn: [
        {
          turn_id: 1,
          cost: 0.01,
          llm_cost: 0.005,
          tool_cost: 0.005,
          total_cost: 0.01,
          input_tokens: 100,
          output_tokens: 50,
        },
      ],
      input_tokens: 100,
      output_tokens: 50,
    };
    const traj: Trajectory = makeTrajectory({
      turns: [
        makeTurn({ turn_id: 1, role: 'agent', content: 'test', timestamp: '2026-04-15T23:00:00Z' }),
      ],
    });

    const recs = getOptimizationRecommendations(cost, traj);

    expect(recs.some((r) => r.includes('batching') || r.includes('cheaper tools'))).toBe(true);
  });

  it('should flag expensive turns', () => {
    const cost = {
      total_cost: 0.052,
      llm_cost: 0.05,
      tool_cost: 0.002,
      per_turn: [
        {
          turn_id: 1,
          cost: 0.001,
          llm_cost: 0.001,
          tool_cost: 0,
          total_cost: 0.001,
          input_tokens: 10,
          output_tokens: 5,
        },
        {
          turn_id: 2,
          cost: 0.001,
          llm_cost: 0.001,
          tool_cost: 0,
          total_cost: 0.001,
          input_tokens: 10,
          output_tokens: 5,
        },
        {
          turn_id: 3,
          cost: 0.05,
          llm_cost: 0.048,
          tool_cost: 0.002,
          total_cost: 0.05,
          input_tokens: 1000,
          output_tokens: 500,
        },
      ],
      input_tokens: 1020,
      output_tokens: 510,
    };
    const traj: Trajectory = makeTrajectory({
      turns: [
        makeTurn({
          turn_id: 1,
          role: 'agent',
          content: 'cheap',
          timestamp: '2026-04-15T23:00:00Z',
        }),
        makeTurn({
          turn_id: 2,
          role: 'agent',
          content: 'cheap',
          timestamp: '2026-04-15T23:00:01Z',
        }),
        makeTurn({
          turn_id: 3,
          role: 'agent',
          content: 'expensive',
          timestamp: '2026-04-15T23:00:02Z',
        }),
      ],
    });

    const recs = getOptimizationRecommendations(cost, traj);

    expect(recs.some((r) => r.includes('2x'))).toBe(true);
  });

  it('should recommend task decomposition for long conversations', () => {
    const turns: Turn[] = [];
    for (let i = 0; i < 15; i++) {
      turns.push(
        makeTurn({
          turn_id: i,
          role: 'agent',
          content: `turn ${i}`,
          timestamp: '2026-04-15T23:00:00Z',
        }),
      );
      turns.push(
        makeTurn({
          turn_id: i + 100,
          role: 'user',
          content: `user ${i}`,
          timestamp: '2026-04-15T23:00:01Z',
        }),
      );
    }
    const traj: Trajectory = makeTrajectory({ turns });
    const cost = {
      total_cost: 0.01,
      llm_cost: 0.01,
      tool_cost: 0,
      per_turn: [],
      input_tokens: 100,
      output_tokens: 50,
    };

    const recs = getOptimizationRecommendations(cost, traj);

    expect(recs.some((r) => r.includes('decomposition') || r.includes('termination'))).toBe(true);
  });

  it('should return empty array for efficient trajectories', () => {
    const cost = {
      total_cost: 0.0001,
      llm_cost: 0.0001,
      tool_cost: 0,
      per_turn: [
        {
          turn_id: 1,
          cost: 0.0001,
          llm_cost: 0.0001,
          tool_cost: 0,
          total_cost: 0.0001,
          input_tokens: 100,
          output_tokens: 50,
        },
      ],
      input_tokens: 100,
      output_tokens: 50,
    };
    const traj: Trajectory = makeTrajectory({
      turns: [
        makeTurn({ turn_id: 1, role: 'agent', content: 'ok', timestamp: '2026-04-15T23:00:00Z' }),
      ],
    });

    const recs = getOptimizationRecommendations(cost, traj);

    expect(recs.length).toBe(0);
  });
});

describe('createBudget', () => {
  it('should create strict budget preset', () => {
    const budget = createBudget('strict');

    expect(budget.perTask).toBe(0.01);
    expect(budget.perTrajectory).toBe(0.5);
    expect(budget.daily).toBe(10.0);
    expect(budget.perToolCall).toBe(0.001);
  });

  it('should create moderate budget preset', () => {
    const budget = createBudget('moderate');

    expect(budget.perTask).toBe(0.05);
    expect(budget.perTrajectory).toBe(1.0);
    expect(budget.daily).toBe(50.0);
    expect(budget.perToolCall).toBe(0.005);
  });

  it('should create lenient budget preset', () => {
    const budget = createBudget('lenient');

    expect(budget.perTask).toBe(0.1);
    expect(budget.perTrajectory).toBe(5.0);
    expect(budget.daily).toBe(100.0);
    expect(budget.perToolCall).toBe(0.01);
  });

  it('should have increasingly permissive limits across presets', () => {
    const strict = createBudget('strict');
    const moderate = createBudget('moderate');
    const lenient = createBudget('lenient');

    expect(strict.perTrajectory!).toBeLessThan(moderate.perTrajectory!);
    expect(moderate.perTrajectory!).toBeLessThan(lenient.perTrajectory!);
    expect(strict.daily!).toBeLessThan(moderate.daily!);
    expect(moderate.daily!).toBeLessThan(lenient.daily!);
  });
});

describe('CostTracker', () => {
  it('should track cumulative costs across trajectories', () => {
    const tracker = new CostTracker();

    const cost1 = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const cost2 = calculateTrajectoryCost(baseTrajectory, 'gemini-pro');

    tracker.addTrajectory(cost1);
    tracker.addTrajectory(cost2);

    expect(tracker.getTotalCost()).toBe(
      Math.round((cost1.total_cost + cost2.total_cost) * 10000) / 10000,
    );
    expect(tracker.getTrajectoryCount()).toBe(2);
  });

  it('should return within budget when no daily budget set', () => {
    const tracker = new CostTracker();
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const result = tracker.addTrajectory(cost);

    expect(result.withinBudget).toBe(true);
    expect(result.budgetLimit).toBe(0);
  });

  it('should enforce daily budget', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const tracker = new CostTracker(cost.total_cost * 0.5);

    const result = tracker.addTrajectory(cost);

    expect(result.withinBudget).toBe(false);
    expect(result.usagePercentage).toBe(200);
  });

  it('should generate warning alert at 75% daily budget', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget = cost.total_cost * (1 / 0.76);
    const tracker = new CostTracker(budget);

    tracker.addTrajectory(cost);

    expect(tracker.getTotalCost()).toBeGreaterThan(0);
  });

  it('should generate error alert at 90% daily budget', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const budget = cost.total_cost * (1 / 0.91);
    const tracker = new CostTracker(budget);

    const result = tracker.addTrajectory(cost);

    expect(result.alerts.some((a) => a.level === 'error')).toBe(true);
  });

  it('should reset all tracked data', () => {
    const tracker = new CostTracker();
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    tracker.addTrajectory(cost);
    expect(tracker.getTrajectoryCount()).toBe(1);
    expect(tracker.getTotalCost()).toBeGreaterThan(0);

    tracker.reset();

    expect(tracker.getTotalCost()).toBe(0);
    expect(tracker.getTrajectoryCount()).toBe(0);
  });

  it('should accumulate multiple trajectories correctly', () => {
    const tracker = new CostTracker();
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    for (let i = 0; i < 5; i++) {
      tracker.addTrajectory(cost);
    }

    expect(tracker.getTrajectoryCount()).toBe(5);
    expect(tracker.getTotalCost()).toBe(Math.round(cost.total_cost * 5 * 10000) / 10000);
  });
});

describe('generateCostReport', () => {
  const cost1 = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
  const cost2 = calculateTrajectoryCost(baseTrajectory, 'gemini-pro');

  const trajectories = [
    { trajectory: baseTrajectory, cost: cost1 },
    {
      trajectory: makeTrajectory({
        trajectory_id: 'traj-2',
        turns: [agentTurn1],
        metadata: { start_time: '2026-04-15T23:00:00Z' },
      }),
      cost: cost2,
    },
  ];

  it('should generate a report with correct totals', () => {
    const report = generateCostReport(trajectories);

    expect(report.trajectoryCount).toBe(2);
    expect(report.totalCost).toBe(
      Math.round((cost1.total_cost + cost2.total_cost) * 10000) / 10000,
    );
    expect(report.avgCostPerTrajectory).toBe(
      Math.round(((cost1.total_cost + cost2.total_cost) / 2) * 10000) / 10000,
    );
  });

  it('should include cost component breakdown', () => {
    const report = generateCostReport(trajectories);

    expect(report.breakdown.llmCalls).toBe((cost1.llm_cost ?? 0) + (cost2.llm_cost ?? 0));
    expect(report.breakdown.toolInvocations).toBe((cost1.tool_cost ?? 0) + (cost2.tool_cost ?? 0));
  });

  it('should include per-trajectory cost entries', () => {
    const report = generateCostReport(trajectories);

    expect(report.perTrajectory.length).toBe(2);
    expect(report.perTrajectory[0]!.trajectoryId).toBe('traj-1');
    expect(report.perTrajectory[1]!.trajectoryId).toBe('traj-2');
  });

  it('should include top expensive operations', () => {
    const report = generateCostReport(trajectories);

    expect(report.topExpensive.length).toBeGreaterThan(0);
    expect(report.topExpensive[0]!.type).toBeDefined();
    expect(report.topExpensive[0]!.cost).toBeGreaterThanOrEqual(0);
  });

  it('should include trends when more than one trajectory and includeTrends is true', () => {
    const report = generateCostReport(trajectories, { includeTrends: true });

    expect(report.generatedAt).toBeDefined();
  });

  it('should exclude trends when includeTrends is false', () => {
    const report = generateCostReport(trajectories, { includeTrends: false });

    expect(report.trends).toBeUndefined();
  });

  it('should handle empty trajectories array', () => {
    const report = generateCostReport([]);

    expect(report.totalCost).toBe(0);
    expect(report.trajectoryCount).toBe(0);
    expect(report.avgCostPerTrajectory).toBe(0);
    expect(report.perTrajectory.length).toBe(0);
  });

  it('should respect topN option', () => {
    const report = generateCostReport(trajectories, { topN: 1 });

    expect(report.topExpensive.length).toBeLessThanOrEqual(1);
  });

  it('should use "unknown" for trajectories without trajectory_id', () => {
    const trajNoId = makeTrajectory({ turns: [agentTurn1] });
    const cost = calculateTrajectoryCost(trajNoId, 'claude-opus');

    const report = generateCostReport([{ trajectory: trajNoId, cost }]);

    expect(report.perTrajectory[0]!.trajectoryId).toBe('unknown');
  });
});

describe('exportToCsv', () => {
  it('should export report as CSV string', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const report = generateCostReport([{ trajectory: baseTrajectory, cost }]);

    const csv = exportToCsv(report);

    expect(csv).toContain('Metric,Value');
    expect(csv).toContain('Total Cost');
    expect(csv).toContain('Trajectory Count');
    expect(csv).toContain('traj-1');
    expect(csv).toContain(String(report.totalCost));
  });

  it('should include per-trajectory data', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const report = generateCostReport([{ trajectory: baseTrajectory, cost }]);

    const csv = exportToCsv(report);

    expect(csv).toContain(
      'Trajectory ID,Total Cost,Input Tokens,Output Tokens,Turn Count,Timestamp',
    );
    expect(csv).toContain('Input Tokens');
  });
});

describe('exportToJson', () => {
  it('should export report as valid JSON string', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const report = generateCostReport([{ trajectory: baseTrajectory, cost }]);

    const json = exportToJson(report);

    const parsed = JSON.parse(json);
    expect(parsed.totalCost).toBe(report.totalCost);
    expect(parsed.trajectoryCount).toBe(report.trajectoryCount);
    expect(parsed.perTrajectory.length).toBe(report.perTrajectory.length);
  });
});

describe('formatCost', () => {
  it('should format cost in USD by default', () => {
    const formatted = formatCost(0.0234);

    expect(formatted).toContain('$');
    expect(formatted).toContain('0.0234');
  });

  it('should format cost in specified currency', () => {
    const formatted = formatCost(0.0234, 'EUR');

    expect(formatted).toContain('€');
  });

  it('should format zero cost', () => {
    const formatted = formatCost(0);

    expect(formatted).toContain('0.0000');
  });

  it('should format large costs', () => {
    const formatted = formatCost(1234.56);

    expect(formatted).toContain('1,234.56');
  });
});

describe('generateSummary', () => {
  it('should generate a human-readable summary', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const report = generateCostReport([{ trajectory: baseTrajectory, cost }]);

    const summary = generateSummary(report);

    expect(summary).toContain('=== Cost Report ===');
    expect(summary).toContain('Total Cost:');
    expect(summary).toContain('Trajectories:');
    expect(summary).toContain('Avg per Trajectory:');
    expect(summary).toContain('Breakdown:');
    expect(summary).toContain('LLM Calls:');
    expect(summary).toContain('Tool Invocations:');
    expect(summary).toContain('Top Expensive:');
  });

  it('should include formatted currency values', () => {
    const cost = calculateTrajectoryCost(baseTrajectory, 'claude-opus');
    const report = generateCostReport([{ trajectory: baseTrajectory, cost }]);

    const summary = generateSummary(report);

    expect(summary).toContain('$');
  });
});
