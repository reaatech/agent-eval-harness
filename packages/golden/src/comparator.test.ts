import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { batchCompare, compareAgainstGolden, findBestGolden } from './comparator.js';
import type { GoldenTrajectory } from './manager.js';

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    turn_id: 1,
    role: 'user',
    content: 'Hello',
    timestamp: '2026-04-15T23:00:00Z',
    ...overrides,
  };
}

function makeTrajectory(turns: Turn[] = []): Trajectory {
  return {
    trajectory_id: 'traj-test',
    turns:
      turns.length > 0
        ? turns
        : [
            makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
            {
              turn_id: 2,
              role: 'agent',
              content: 'I can help with that. What is your email?',
              tool_calls: [],
              timestamp: '2026-04-15T23:00:01Z',
            },
          ],
  };
}

function makeGolden(overrides: Partial<GoldenTrajectory> = {}): GoldenTrajectory {
  return {
    id: 'golden-1',
    metadata: {
      version: '1.0.0',
      createdAt: '2026-04-15T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      description: 'Password reset scenario',
      tags: ['auth', 'password-reset'],
      qualityNotes: 'Standard password reset flow',
      expectedOutcomes: ['Password reset email sent'],
    },
    trajectory: makeTrajectory([
      makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
      {
        turn_id: 2,
        role: 'agent',
        content: 'I can help with that. What is your email?',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
        golden: true,
        expected: true,
      },
      { turn_id: 3, role: 'user', content: 'john@example.com', timestamp: '2026-04-15T23:00:05Z' },
      {
        turn_id: 4,
        role: 'agent',
        content: 'Password reset sent!',
        tool_calls: [
          {
            name: 'send_reset_email',
            arguments: { email: 'john@example.com' },
            result: { status: 'sent' },
          },
        ],
        timestamp: '2026-04-15T23:00:06Z',
        golden: true,
        expected: true,
      },
    ]),
    ...overrides,
  };
}

describe('compareAgainstGolden', () => {
  let golden: GoldenTrajectory;

  beforeEach(() => {
    golden = makeGolden();
  });

  it('should return similarity 1 for identical trajectories', () => {
    const result = compareAgainstGolden(golden, golden.trajectory);
    expect(result.similarity).toBe(1);
    expect(result.passesThreshold).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('should return similarity < 1 for divergent trajectories', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'Completely different response about weather patterns and climate',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Another completely unrelated response about space exploration',
          tool_calls: [
            { name: 'lookup_star', arguments: { star: 'sirius' }, result: { found: true } },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate);
    expect(result.similarity).toBeLessThan(1);
  });

  it('should detect content divergence regressions', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'Different response content entirely',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Password reset sent!',
          tool_calls: [
            {
              name: 'send_reset_email',
              arguments: { email: 'john@example.com' },
              result: { status: 'sent' },
            },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate);
    const contentReg = result.regressions.find((r) => r.type === 'content_divergence');
    expect(contentReg).toBeDefined();
  });

  it('should detect tool mismatch regressions', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that. What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Password reset sent!',
          tool_calls: [
            {
              name: 'wrong_tool',
              arguments: { email: 'john@example.com' },
              result: { status: 'sent' },
            },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate);
    const toolReg = result.regressions.find((r) => r.type === 'tool_mismatch');
    expect(toolReg).toBeDefined();
    expect(toolReg?.severity).toBe('high');
  });

  it('should detect missing turns in candidate', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that. What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate);
    const missingReg = result.regressions.find((r) => r.type === 'missing_turn');
    expect(missingReg).toBeDefined();
    expect(missingReg?.severity).toBe('high');
  });

  it('should detect extra turns in candidate', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that. What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Password reset sent!',
          tool_calls: [
            {
              name: 'send_reset_email',
              arguments: { email: 'john@example.com' },
              result: { status: 'sent' },
            },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
        {
          turn_id: 5,
          role: 'agent',
          content: 'Is there anything else I can help with?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:07Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate);
    const extraReg = result.regressions.find((r) => r.type === 'extra_turn');
    expect(extraReg).toBeDefined();
    expect(extraReg?.severity).toBe('medium');
  });

  it('should produce turnComparisons for each agent turn pair', () => {
    const result = compareAgainstGolden(golden, golden.trajectory);
    expect(result.turnComparisons).toHaveLength(2);
  });

  it('should produce a diffSummary string', () => {
    const result = compareAgainstGolden(golden, golden.trajectory);
    expect(result.diffSummary).toBeTruthy();
    expect(typeof result.diffSummary).toBe('string');
  });

  it('should count matchingTurns correctly for identical trajectories', () => {
    const result = compareAgainstGolden(golden, golden.trajectory);
    expect(result.matchingTurns).toBe(2);
    expect(result.divergentTurns).toBe(0);
  });

  it('should respect similarityThreshold from config', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that. What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Password reset sent!',
          tool_calls: [
            {
              name: 'send_reset_email',
              arguments: { email: 'john@example.com' },
              result: { status: 'sent' },
            },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };
    const strict = compareAgainstGolden(golden, candidate, { similarityThreshold: 1.0 });
    expect(strict.passesThreshold).toBe(true);
    const loose = compareAgainstGolden(golden, candidate, { similarityThreshold: 0.0 });
    expect(loose.passesThreshold).toBe(true);
  });

  it('should skip tool comparison when compareTools is false', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that. What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Password reset sent!',
          tool_calls: [{ name: 'different_tool', arguments: { x: 'y' }, result: {} }],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate, { compareTools: false });
    const toolReg = result.regressions.find((r) => r.type === 'tool_mismatch');
    expect(toolReg).toBeUndefined();
  });

  it('should report totalTurns as max of golden and candidate agent turns', () => {
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Hi' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hello',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };
    const result = compareAgainstGolden(golden, candidate);
    expect(result.totalTurns).toBe(2);
  });
});

describe('batchCompare', () => {
  it('should compare multiple candidates against a golden', () => {
    const golden = makeGolden();
    const candidates: Trajectory[] = [golden.trajectory, golden.trajectory];
    const results = batchCompare(golden, candidates);
    expect(results).toHaveLength(2);
    expect(results[0]?.result.similarity).toBe(1);
    expect(results[1]?.result.similarity).toBe(1);
  });

  it('should include the original trajectory reference in results', () => {
    const golden = makeGolden();
    const candidate = golden.trajectory;
    const results = batchCompare(golden, [candidate]);
    expect(results[0]?.trajectory).toBe(candidate);
  });

  it('should pass config through to compareAgainstGolden', () => {
    const golden = makeGolden();
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that entirely about password reset',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Password reset sent!',
          tool_calls: [
            {
              name: 'send_reset_email',
              arguments: { email: 'john@example.com' },
              result: { status: 'sent' },
            },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };
    const strict = batchCompare(golden, [candidate], { similarityThreshold: 1.0 });
    const loose = batchCompare(golden, [candidate], { similarityThreshold: 0.01 });
    expect(strict[0]?.result.passesThreshold).toBe(false);
    expect(loose[0]?.result.passesThreshold).toBe(true);
  });

  it('should return empty array for empty candidates', () => {
    const golden = makeGolden();
    const results = batchCompare(golden, []);
    expect(results).toHaveLength(0);
  });
});

describe('findBestGolden', () => {
  it('should return the golden with highest similarity', () => {
    const golden1 = makeGolden({ id: 'g1' });
    golden1.trajectory = makeTrajectory([
      makeTurn({ turn_id: 1, role: 'user', content: 'Search for cats' }),
      {
        turn_id: 2,
        role: 'agent',
        content: 'Found 3 cats',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const golden2 = makeGolden({ id: 'g2' });
    golden2.trajectory = makeTrajectory([
      makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
      {
        turn_id: 2,
        role: 'agent',
        content: 'I can help with that. What is your email?',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const candidate: Trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
        {
          turn_id: 2,
          role: 'agent',
          content: 'I can help with that. What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };
    const best = findBestGolden(candidate, [golden1, golden2]);
    expect(best).not.toBeNull();
    expect(best?.golden.id).toBe('g2');
    expect(best?.result.similarity).toBe(1);
  });

  it('should return null for empty goldens array', () => {
    const candidate = makeTrajectory();
    const result = findBestGolden(candidate, []);
    expect(result).toBeNull();
  });

  it('should return the single golden when only one is provided', () => {
    const golden = makeGolden();
    const best = findBestGolden(golden.trajectory, [golden]);
    expect(best).not.toBeNull();
    expect(best?.golden.id).toBe('golden-1');
  });
});
