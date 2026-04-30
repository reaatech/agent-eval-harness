import type { CostBreakdown, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING,
  calculateTrajectoryCost,
  calculateTurnCost,
  compareCosts,
  getCostPerMetric,
} from './tracker.js';

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

    expect(result.per_turn?.length).toBe(2);
    expect(result.per_turn?.every((tc) => tc.turn_id !== 3)).toBe(true);
  });

  it('should sum per-turn costs into totals', () => {
    const result = calculateTrajectoryCost(baseTrajectory, 'claude-opus');

    const sumLlm = result.per_turn?.reduce((s, tc) => s + (tc.llm_cost ?? 0), 0);
    const sumTool = result.per_turn?.reduce((s, tc) => s + (tc.tool_cost ?? 0), 0);

    expect(result.llm_cost).toBe(Math.round((sumLlm ?? 0) * 10000) / 10000);
    expect(result.tool_cost).toBe(Math.round((sumTool ?? 0) * 10000) / 10000);
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
    expect(result.per_turn?.length).toBe(0);
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
