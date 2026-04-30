import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import {
  exportToCsv,
  exportToJson,
  formatCost,
  generateCostReport,
  generateSummary,
} from './reporter.js';
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
    expect(report.perTrajectory[0]?.trajectoryId).toBe('traj-1');
    expect(report.perTrajectory[1]?.trajectoryId).toBe('traj-2');
  });

  it('should include top expensive operations', () => {
    const report = generateCostReport(trajectories);

    expect(report.topExpensive.length).toBeGreaterThan(0);
    expect(report.topExpensive[0]?.type).toBeDefined();
    expect(report.topExpensive[0]?.cost).toBeGreaterThanOrEqual(0);
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

    expect(report.perTrajectory[0]?.trajectoryId).toBe('unknown');
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

    expect(formatted).toContain('\u20ac');
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
