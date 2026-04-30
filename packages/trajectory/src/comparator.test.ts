import type { GoldenTrajectory, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import { compare } from './comparator.js';

function makeTrajectory(turns: Turn[]): Trajectory {
  return { turns };
}

function makeGolden(trajectory: Trajectory): GoldenTrajectory {
  return {
    id: 'golden-1',
    name: 'test-golden',
    trajectory,
    version: '1.0.0',
    created_at: '2026-04-15T00:00:00Z',
    updated_at: '2026-04-15T00:00:00Z',
    quality_markers: {
      faithfulness: 0.9,
      relevance: 0.9,
      tool_correctness: 0.9,
      overall: 0.9,
    },
  };
}

describe('compare', () => {
  it('should return similarity 1 for identical trajectories', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(traj, traj);
    expect(result.similarity).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('should return similarity < 1 for different trajectories', () => {
    const traj1 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const traj2 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Greetings and salutations!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(traj1, traj2);
    expect(result.similarity).toBeLessThan(1);
  });

  it('should produce turnComparisons with differences when content differs', () => {
    const traj1 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const traj2 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Greetings and salutations!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(traj1, traj2);
    const agentTurnComp = result.turnComparisons.find((tc) => tc.turnId === 2);
    expect(agentTurnComp).toBeDefined();
    expect(agentTurnComp?.differences.length).toBeGreaterThan(0);
  });

  it('should detect missing turns', () => {
    const golden = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'Bye', timestamp: '2026-04-15T23:00:02Z' },
      {
        turn_id: 4,
        role: 'agent',
        content: 'See ya!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const candidate = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(candidate, golden);
    expect(result.diff.missingTurns.length).toBeGreaterThan(0);
  });

  it('should detect extra turns', () => {
    const golden = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const candidate = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'Extra', timestamp: '2026-04-15T23:00:02Z' },
      {
        turn_id: 4,
        role: 'agent',
        content: 'Turn',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const result = compare(candidate, golden);
    expect(result.diff.extraTurns.length).toBeGreaterThan(0);
  });

  it('should report regressions for missing golden turns', () => {
    const golden = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'Bye', timestamp: '2026-04-15T23:00:02Z' },
      {
        turn_id: 4,
        role: 'agent',
        content: 'See ya!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const candidate = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(candidate, golden);
    const missingReg = result.regressions.find((r) => r.type === 'missing_turn');
    expect(missingReg).toBeDefined();
    expect(missingReg?.severity).toBe('critical');
  });

  it('should report regressions for low similarity turns', () => {
    const traj1 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'The quick brown fox jumps',
        tool_calls: [{ name: 'search', arguments: { q: 'a', b: 'c' }, result: {} }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const traj2 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'ZZZZZZZZZZZZZZZZZZZZZZZZZ',
        tool_calls: [{ name: 'delete', arguments: { q: 'z', b: 'y' }, result: {} }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(traj1, traj2);
    const simReg = result.regressions.find((r) => r.type === 'low_similarity');
    expect(simReg).toBeDefined();
    expect(simReg?.turnId).toBe(2);
  });

  it('should return turnComparisons for each turn pair', () => {
    const traj1 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const traj2 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(traj1, traj2);
    expect(result.turnComparisons).toHaveLength(2);
    expect(result.turnComparisons[0]?.matches).toBe(true);
    expect(result.turnComparisons[1]?.matches).toBe(true);
  });

  it('should detect improvements when candidate adds tool results', () => {
    const golden = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Search', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Done',
        tool_calls: [{ name: 'search', arguments: { q: 'test' } }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const candidate = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Search', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Done',
        tool_calls: [{ name: 'search', arguments: { q: 'test' }, result: { found: true } }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(candidate, golden);
    const toolImprov = result.improvements.find((i) => i.type === 'tool_result_added');
    expect(toolImprov).toBeDefined();
  });

  it('should respect similarityThreshold option', () => {
    const traj1 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const traj2 = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Greetings!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const looseResult = compare(traj1, traj2, { similarityThreshold: 0.5 });
    expect(looseResult.passed).toBe(true);
  });

  it('should work with GoldenTrajectory as golden parameter', () => {
    const candidate = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const golden = makeGolden(candidate);
    const result = compare(candidate, golden);
    expect(result.similarity).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('should fail when critical regressions exist regardless of threshold', () => {
    const golden = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'More', timestamp: '2026-04-15T23:00:02Z' },
      {
        turn_id: 4,
        role: 'agent',
        content: 'Ok',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const candidate = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = compare(candidate, golden, { similarityThreshold: 0 });
    expect(result.passed).toBe(false);
  });
});
