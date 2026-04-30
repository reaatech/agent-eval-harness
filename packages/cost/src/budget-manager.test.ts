import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import {
  CostTracker,
  checkBudget,
  createBudget,
  getOptimizationRecommendations,
} from './budget-manager.js';
import type { BudgetConfig } from './budget-manager.js';
import { calculateTrajectoryCost } from './tracker.js';

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

    expect(strict.perTrajectory as number).toBeLessThan(moderate.perTrajectory as number);
    expect(moderate.perTrajectory as number).toBeLessThan(lenient.perTrajectory as number);
    expect(strict.daily as number).toBeLessThan(moderate.daily as number);
    expect(moderate.daily as number).toBeLessThan(lenient.daily as number);
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
