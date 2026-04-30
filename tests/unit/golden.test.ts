import { beforeEach, describe, expect, it } from 'vitest';
import { batchCompare, compareAgainstGolden, findBestGolden } from '../../src/golden/comparator.js';
import {
  GoldenCurator,
  batchQualityCheck,
  createCurator,
  generateCurationReport,
  quickCreateGolden,
} from '../../src/golden/curator.js';
import {
  createGolden,
  filterByTags,
  getByScenario,
  goldenToJSONL,
  loadGoldenTrajectories,
  updateGolden,
  validateGolden,
} from '../../src/golden/manager.js';
import type { GoldenTrajectory } from '../../src/golden/manager.js';
import type { Trajectory, Turn } from '../../src/types/domain.js';

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

const SINGLE_GOLDEN_JSONL = [
  JSON.stringify({
    _golden_metadata: {
      id: 'golden-1',
      version: '1.0.0',
      createdAt: '2026-04-15T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      description: 'Password reset',
      tags: ['auth'],
    },
  }),
  JSON.stringify({
    turn_id: 1,
    role: 'user',
    content: 'Reset my password',
    timestamp: '2026-04-15T23:00:00Z',
    golden: true,
  }),
  JSON.stringify({
    turn_id: 2,
    role: 'agent',
    content: 'What is your email?',
    tool_calls: [],
    timestamp: '2026-04-15T23:00:01Z',
    golden: true,
    expected: true,
  }),
  JSON.stringify({
    turn_id: 3,
    role: 'user',
    content: 'john@example.com',
    timestamp: '2026-04-15T23:00:05Z',
    golden: true,
  }),
  JSON.stringify({
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
  }),
].join('\n');

const MULTI_GOLDEN_JSONL = [
  JSON.stringify({
    _golden_metadata: {
      id: 'golden-a',
      version: '1.0.0',
      createdAt: '2026-04-15T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      description: 'Login flow',
      tags: ['auth', 'login'],
    },
  }),
  JSON.stringify({
    turn_id: 1,
    role: 'user',
    content: 'Login',
    timestamp: '2026-04-15T23:00:00Z',
    golden: true,
  }),
  JSON.stringify({
    turn_id: 2,
    role: 'agent',
    content: 'Please enter credentials',
    tool_calls: [],
    timestamp: '2026-04-15T23:00:01Z',
    golden: true,
    expected: true,
  }),
  JSON.stringify({
    _golden_metadata: {
      id: 'golden-b',
      version: '1.0.0',
      createdAt: '2026-04-15T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      description: 'Search flow',
      tags: ['search'],
    },
  }),
  JSON.stringify({
    turn_id: 1,
    role: 'user',
    content: 'Search for cats',
    timestamp: '2026-04-15T23:00:00Z',
    golden: true,
  }),
  JSON.stringify({
    turn_id: 2,
    role: 'agent',
    content: 'Found 3 results',
    tool_calls: [{ name: 'search', arguments: { q: 'cats' }, result: { count: 3 } }],
    timestamp: '2026-04-15T23:00:01Z',
    golden: true,
    expected: true,
  }),
].join('\n');

describe('loadGoldenTrajectories', () => {
  it('should parse a single golden trajectory from JSONL', () => {
    const results = loadGoldenTrajectories(SINGLE_GOLDEN_JSONL);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('golden-1');
    expect(results[0]?.metadata.description).toBe('Password reset');
    expect(results[0]?.metadata.tags).toEqual(['auth']);
    expect(results[0]?.trajectory.turns).toHaveLength(4);
  });

  it('should parse multiple golden trajectories separated by metadata lines', () => {
    const results = loadGoldenTrajectories(MULTI_GOLDEN_JSONL);
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('golden-a');
    expect(results[0]?.metadata.description).toBe('Login flow');
    expect(results[0]?.trajectory.turns).toHaveLength(2);
    expect(results[1]?.id).toBe('golden-b');
    expect(results[1]?.metadata.description).toBe('Search flow');
    expect(results[1]?.trajectory.turns).toHaveLength(2);
  });

  it('should set trajectory_id to golden id on each trajectory', () => {
    const results = loadGoldenTrajectories(SINGLE_GOLDEN_JSONL);
    expect(results[0]?.trajectory.trajectory_id).toBe('golden-1');
  });

  it('should populate metadata start_time and end_time from turns', () => {
    const results = loadGoldenTrajectories(SINGLE_GOLDEN_JSONL);
    expect(results[0]?.trajectory.metadata?.start_time).toBe('2026-04-15T23:00:00Z');
    expect(results[0]?.trajectory.metadata?.end_time).toBe('2026-04-15T23:00:06Z');
  });

  it('should preserve tool_calls on turns', () => {
    const results = loadGoldenTrajectories(SINGLE_GOLDEN_JSONL);
    const agentTurn = results[0]?.trajectory.turns.find((t) => t.turn_id === 4);
    expect(agentTurn?.tool_calls).toHaveLength(1);
    expect(agentTurn?.tool_calls?.[0]?.name).toBe('send_reset_email');
    expect(agentTurn?.tool_calls?.[0]?.arguments).toEqual({ email: 'john@example.com' });
  });

  it('should preserve golden and expected metadata on turns', () => {
    const results = loadGoldenTrajectories(SINGLE_GOLDEN_JSONL);
    const agentTurn = results[0]?.trajectory.turns.find((t) => t.turn_id === 2);
    expect(agentTurn?.golden).toBe(true);
    expect(agentTurn?.expected).toBe(true);
  });

  it('should return empty array for empty content', () => {
    const results = loadGoldenTrajectories('');
    expect(results).toHaveLength(0);
  });

  it('should return empty array for whitespace-only content', () => {
    const results = loadGoldenTrajectories('   \n  \n  ');
    expect(results).toHaveLength(0);
  });

  it('should generate default id when metadata has no id', () => {
    const jsonl = [
      JSON.stringify({ _golden_metadata: { description: 'No ID', tags: [] } }),
      JSON.stringify({
        turn_id: 1,
        role: 'user',
        content: 'Hi',
        timestamp: '2026-04-15T23:00:00Z',
      }),
    ].join('\n');
    const results = loadGoldenTrajectories(jsonl);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toMatch(/^golden-/);
  });

  it('should use default version when metadata omits version', () => {
    const jsonl = [
      JSON.stringify({ _golden_metadata: { id: 'g1', tags: [] } }),
      JSON.stringify({
        turn_id: 1,
        role: 'user',
        content: 'Hi',
        timestamp: '2026-04-15T23:00:00Z',
      }),
    ].join('\n');
    const results = loadGoldenTrajectories(jsonl);
    expect(results[0]?.metadata.version).toBe('1.0.0');
  });

  it('should preserve optional qualityNotes and expectedOutcomes', () => {
    const jsonl = [
      JSON.stringify({
        _golden_metadata: {
          id: 'g-opts',
          version: '1.0.0',
          description: 'test',
          tags: ['t'],
          qualityNotes: 'High quality',
          expectedOutcomes: ['Outcome A'],
        },
      }),
      JSON.stringify({
        turn_id: 1,
        role: 'user',
        content: 'Hi',
        timestamp: '2026-04-15T23:00:00Z',
      }),
    ].join('\n');
    const results = loadGoldenTrajectories(jsonl);
    expect(results[0]?.metadata.qualityNotes).toBe('High quality');
    expect(results[0]?.metadata.expectedOutcomes).toEqual(['Outcome A']);
  });
});

describe('validateGolden', () => {
  it('should return valid for a well-formed golden trajectory', () => {
    const golden = makeGolden();
    const result = validateGolden(golden);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should return error when trajectory has no turns', () => {
    const golden = makeGolden({
      trajectory: { turns: [] },
    });
    const result = validateGolden(golden);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Trajectory has no turns');
    expect(result.score).toBe(0);
  });

  it('should return error when trajectory does not start with user turn', () => {
    const golden = makeGolden({
      trajectory: {
        turns: [
          {
            turn_id: 1,
            role: 'agent',
            content: 'Hello',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:00Z',
          },
          { turn_id: 2, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:01Z' },
        ],
      },
    });
    const result = validateGolden(golden);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Trajectory should start with a user turn');
  });

  it('should return warning when description is missing', () => {
    const golden = makeGolden();
    golden.metadata.description = '';
    const result = validateGolden(golden);
    expect(result.warnings).toContain('Missing description');
  });

  it('should return warning when tags are empty', () => {
    const golden = makeGolden();
    golden.metadata.tags = [];
    const result = validateGolden(golden);
    expect(result.warnings).toContain('No tags specified');
  });

  it('should return warning for consecutive same-role turns', () => {
    const golden = makeGolden({
      trajectory: {
        turns: [
          { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
          { turn_id: 2, role: 'user', content: 'Hello again', timestamp: '2026-04-15T23:00:01Z' },
          {
            turn_id: 3,
            role: 'agent',
            content: 'Hey',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:02Z',
            golden: true,
            expected: true,
          },
        ],
      },
    });
    const result = validateGolden(golden);
    expect(result.warnings.some((w) => w.includes('Consecutive user turns'))).toBe(true);
  });

  it('should return warning for turn with no content or tool calls', () => {
    const golden = makeGolden({
      trajectory: {
        turns: [
          { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
          {
            turn_id: 2,
            role: 'agent',
            content: '',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:01Z',
            golden: true,
            expected: true,
          },
        ],
      },
    });
    const result = validateGolden(golden);
    expect(result.warnings.some((w) => w.includes('has no content or tool calls'))).toBe(true);
  });

  it('should return warning when no turns are marked as expected', () => {
    const golden = makeGolden({
      trajectory: {
        turns: [
          { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
          {
            turn_id: 2,
            role: 'agent',
            content: 'Hello',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:01Z',
          },
        ],
      },
    });
    const result = validateGolden(golden);
    expect(result.warnings).toContain('No turns marked as expected');
  });

  it('should return score of 0 when errors exist', () => {
    const golden = makeGolden({
      trajectory: { turns: [] },
    });
    const result = validateGolden(golden);
    expect(result.score).toBe(0);
  });

  it('should reduce score for each warning', () => {
    const goldenNoDesc = makeGolden();
    goldenNoDesc.metadata.description = '';
    goldenNoDesc.metadata.tags = [];
    const result = validateGolden(goldenNoDesc);
    const perfectGolden = makeGolden();
    const perfectResult = validateGolden(perfectGolden);
    expect(result.score).toBeLessThan(perfectResult.score);
  });
});

describe('goldenToJSONL', () => {
  it('should serialize golden trajectory to valid JSONL', () => {
    const golden = makeGolden();
    const jsonl = goldenToJSONL(golden);
    const lines = jsonl.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    const metadataLine = JSON.parse(lines[0] ?? '');
    expect(metadataLine._golden_metadata).toBeDefined();
    expect(metadataLine._golden_metadata.id).toBe('golden-1');
  });

  it('should include all turn data in JSONL output', () => {
    const golden = makeGolden();
    const jsonl = goldenToJSONL(golden);
    const lines = jsonl.split('\n');
    const turnLines = lines.slice(1);
    expect(turnLines.length).toBe(golden.trajectory.turns.length);
    const firstTurn = JSON.parse(turnLines[0] ?? '');
    expect(firstTurn.role).toBe('user');
    expect(firstTurn.golden).toBe(true);
  });

  it('should produce output that can be re-parsed by loadGoldenTrajectories', () => {
    const golden = makeGolden();
    const jsonl = goldenToJSONL(golden);
    const reparsed = loadGoldenTrajectories(jsonl);
    expect(reparsed).toHaveLength(1);
    expect(reparsed[0]?.id).toBe(golden.id);
    expect(reparsed[0]?.trajectory.turns.length).toBe(golden.trajectory.turns.length);
    expect(reparsed[0]?.metadata.description).toBe(golden.metadata.description);
  });

  it('should preserve metadata fields in serialization', () => {
    const golden = makeGolden();
    const jsonl = goldenToJSONL(golden);
    const lines = jsonl.split('\n');
    const metadataLine = JSON.parse(lines[0] ?? '');
    expect(metadataLine._golden_metadata.version).toBe('1.0.0');
    expect(metadataLine._golden_metadata.tags).toEqual(['auth', 'password-reset']);
    expect(metadataLine._golden_metadata.qualityNotes).toBe('Standard password reset flow');
    expect(metadataLine._golden_metadata.expectedOutcomes).toEqual(['Password reset email sent']);
  });
});

describe('createGolden', () => {
  it('should create a golden trajectory from a plain trajectory', () => {
    const traj = makeTrajectory();
    const golden = createGolden(traj, {
      description: 'Test scenario',
      tags: ['test'],
    });
    expect(golden.id).toBeDefined();
    expect(golden.metadata.description).toBe('Test scenario');
    expect(golden.metadata.tags).toEqual(['test']);
    expect(golden.metadata.version).toBe('1.0.0');
    expect(golden.trajectory.turns).toHaveLength(traj.turns.length);
  });

  it('should mark agent turns as expected', () => {
    const traj = makeTrajectory();
    const golden = createGolden(traj, { description: 'Test', tags: ['t'] });
    const agentTurns = golden.trajectory.turns.filter((t) => t.role === 'agent');
    for (const turn of agentTurns) {
      expect(turn.golden).toBe(true);
      expect(turn.expected).toBe(true);
    }
  });

  it('should set golden=true on all turns', () => {
    const traj = makeTrajectory();
    const golden = createGolden(traj, { description: 'Test', tags: ['t'] });
    for (const turn of golden.trajectory.turns) {
      expect(turn.golden).toBe(true);
    }
  });

  it('should use tags joined by dash as id when tags are provided', () => {
    const traj = makeTrajectory();
    const golden = createGolden(traj, { description: 'Test', tags: ['auth', 'login'] });
    expect(golden.id).toBe('auth-login');
  });

  it('should generate timestamp-based id when no tags provided', () => {
    const traj = makeTrajectory();
    const golden = createGolden(traj, { description: 'Test' });
    expect(golden.id).toMatch(/^golden-/);
  });

  it('should set createdAt and updatedAt to current time', () => {
    const traj = makeTrajectory();
    const before = new Date().toISOString();
    const golden = createGolden(traj, { description: 'Test', tags: ['t'] });
    const after = new Date().toISOString();
    expect(golden.metadata.createdAt >= before).toBe(true);
    expect(golden.metadata.createdAt <= after).toBe(true);
    expect(golden.metadata.updatedAt).toBe(golden.metadata.createdAt);
  });

  it('should preserve qualityNotes and expectedOutcomes from options', () => {
    const traj = makeTrajectory();
    const golden = createGolden(traj, {
      description: 'Test',
      tags: ['t'],
      qualityNotes: 'Very high quality',
      expectedOutcomes: ['Email sent', 'User notified'],
    });
    expect(golden.metadata.qualityNotes).toBe('Very high quality');
    expect(golden.metadata.expectedOutcomes).toEqual(['Email sent', 'User notified']);
  });
});

describe('updateGolden', () => {
  it('should update metadata fields', () => {
    const golden = makeGolden();
    const updated = updateGolden(golden, { description: 'Updated description' });
    expect(updated.metadata.description).toBe('Updated description');
  });

  it('should update tags', () => {
    const golden = makeGolden();
    const updated = updateGolden(golden, { tags: ['new-tag'] });
    expect(updated.metadata.tags).toEqual(['new-tag']);
  });

  it('should set updatedAt to current time', () => {
    const golden = makeGolden();
    const before = new Date().toISOString();
    const updated = updateGolden(golden, { description: 'Changed' });
    expect(updated.metadata.updatedAt >= before).toBe(true);
  });

  it('should not mutate the original golden', () => {
    const golden = makeGolden();
    const originalDescription = golden.metadata.description;
    updateGolden(golden, { description: 'Mutated?' });
    expect(golden.metadata.description).toBe(originalDescription);
  });

  it('should preserve unmodified metadata fields', () => {
    const golden = makeGolden();
    const updated = updateGolden(golden, { description: 'New desc' });
    expect(updated.metadata.version).toBe(golden.metadata.version);
    expect(updated.metadata.tags).toEqual(golden.metadata.tags);
    expect(updated.metadata.createdAt).toBe(golden.metadata.createdAt);
  });
});

describe('filterByTags', () => {
  it('should filter goldens matching any of the specified tags', () => {
    const g1 = makeGolden({ id: 'g1' });
    g1.metadata.tags = ['auth', 'login'];
    const g2 = makeGolden({ id: 'g2' });
    g2.metadata.tags = ['search'];
    const g3 = makeGolden({ id: 'g3' });
    g3.metadata.tags = ['auth', 'password-reset'];
    const results = filterByTags([g1, g2, g3], ['auth']);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain('g1');
    expect(results.map((r) => r.id)).toContain('g3');
  });

  it('should return empty array when no tags match', () => {
    const g1 = makeGolden();
    g1.metadata.tags = ['auth'];
    const results = filterByTags([g1], ['search']);
    expect(results).toHaveLength(0);
  });

  it('should return empty array for empty input array', () => {
    const results = filterByTags([], ['auth']);
    expect(results).toHaveLength(0);
  });

  it('should return all goldens when tag matches all', () => {
    const g1 = makeGolden();
    g1.metadata.tags = ['auth', 'shared'];
    const g2 = makeGolden();
    g2.metadata.tags = ['shared'];
    const results = filterByTags([g1, g2], ['shared']);
    expect(results).toHaveLength(2);
  });
});

describe('getByScenario', () => {
  it('should find goldens by description substring (case-insensitive)', () => {
    const g1 = makeGolden({ id: 'g1' });
    g1.metadata.description = 'Password Reset Flow';
    const g2 = makeGolden({ id: 'g2' });
    g2.metadata.description = 'Login Flow';
    const results = getByScenario([g1, g2], 'password');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('g1');
  });

  it('should find goldens by trajectory_id substring (case-insensitive)', () => {
    const g1 = makeGolden({ id: 'g1' });
    g1.trajectory.trajectory_id = 'password-reset-flow';
    g1.metadata.description = 'Auth scenario';
    const results = getByScenario([g1], 'PASSWORD');
    expect(results).toHaveLength(1);
  });

  it('should return empty array when no scenarios match', () => {
    const g1 = makeGolden();
    g1.metadata.description = 'Login';
    const results = getByScenario([g1], 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('should return empty array for empty input', () => {
    const results = getByScenario([], 'anything');
    expect(results).toHaveLength(0);
  });
});

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

describe('GoldenCurator', () => {
  let curator: GoldenCurator;
  let trajectory: Trajectory;

  beforeEach(() => {
    trajectory = makeTrajectory([
      makeTurn({ turn_id: 1, role: 'user', content: 'Reset my password' }),
      {
        turn_id: 2,
        role: 'agent',
        content: 'I can help. What is your email?',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
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
      },
    ]);
    curator = new GoldenCurator(trajectory);
  });

  it('should initialize with identify step', () => {
    const state = curator.getState();
    expect(state.step).toBe('identify');
    expect(state.trajectory).toBe(trajectory);
    expect(state.annotations).toHaveLength(0);
  });

  describe('start', () => {
    it('should transition to annotate step', () => {
      const state = curator.start({ description: 'Test', tags: ['test'] });
      expect(state.step).toBe('annotate');
      expect(state.draftMetadata.description).toBe('Test');
      expect(state.draftMetadata.tags).toEqual(['test']);
    });
  });

  describe('annotateTurn', () => {
    it('should add an annotation for a turn', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      const state = curator.annotateTurn({
        turnId: 2,
        expected: true,
        qualityNotes: 'Good response',
      });
      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0]?.turnId).toBe(2);
      expect(state.annotations[0]?.expected).toBe(true);
    });

    it('should replace existing annotation for same turn', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      curator.annotateTurn({ turnId: 2, expected: true });
      const state = curator.annotateTurn({ turnId: 2, expected: false, qualityNotes: 'Revised' });
      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0]?.expected).toBe(false);
    });

    it('should support alternatives in annotations', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      const state = curator.annotateTurn({
        turnId: 2,
        expected: true,
        alternatives: ['Sure, what is your email?', 'Let me help you reset.'],
      });
      expect(state.annotations[0]?.alternatives).toHaveLength(2);
    });
  });

  describe('autoAnnotate', () => {
    it('should annotate all agent turns as expected', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      const state = curator.autoAnnotate();
      const agentTurnIds = trajectory.turns.filter((t) => t.role === 'agent').map((t) => t.turn_id);
      expect(state.annotations).toHaveLength(agentTurnIds.length);
      for (const ann of state.annotations) {
        expect(ann.expected).toBe(true);
      }
    });
  });

  describe('runQualityChecks', () => {
    it('should return passed and score for well-formed trajectory', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      curator.autoAnnotate();
      const result = curator.runQualityChecks();
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.score).toBe('number');
      expect(result.issues).toBeInstanceOf(Array);
      expect(result.suggestions).toBeInstanceOf(Array);
    });

    it('should detect empty content turns as high severity issues', () => {
      const traj: Trajectory = {
        turns: [
          makeTurn({ turn_id: 1, role: 'user', content: 'Hi' }),
          {
            turn_id: 2,
            role: 'agent',
            content: '',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:01Z',
          },
        ],
      };
      const c = new GoldenCurator(traj);
      c.start({ description: 'Test', tags: ['test'] });
      const result = c.runQualityChecks();
      const emptyIssue = result.issues.find(
        (i) => i.type === 'incomplete' && i.severity === 'high',
      );
      expect(emptyIssue).toBeDefined();
      expect(result.passed).toBe(false);
    });

    it('should detect very short content as low severity issues', () => {
      const traj: Trajectory = {
        turns: [
          makeTurn({ turn_id: 1, role: 'user', content: 'Hi' }),
          {
            turn_id: 2,
            role: 'agent',
            content: 'ok',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:01Z',
          },
        ],
      };
      const c = new GoldenCurator(traj);
      c.start({ description: 'Test', tags: ['test'] });
      const result = c.runQualityChecks();
      const shortIssue = result.issues.find((i) => i.description.includes('very short'));
      expect(shortIssue).toBeDefined();
      expect(shortIssue?.severity).toBe('low');
    });

    it('should suggest adding description when missing', () => {
      const c = new GoldenCurator(trajectory);
      c.start({ tags: ['test'] });
      const result = c.runQualityChecks();
      expect(result.suggestions.some((s) => s.includes('description'))).toBe(true);
    });

    it('should suggest adding tags when missing', () => {
      const c = new GoldenCurator(trajectory);
      c.start({ description: 'Test' });
      const result = c.runQualityChecks();
      expect(result.suggestions.some((s) => s.includes('tags'))).toBe(true);
    });

    it('should suggest more annotations when coverage is low', () => {
      const c = new GoldenCurator(trajectory);
      c.start({ description: 'Test', tags: ['test'] });
      const result = c.runQualityChecks();
      expect(result.suggestions.some((s) => s.includes('annotations'))).toBe(true);
    });

    it('should cap score at 0 minimum', () => {
      const traj: Trajectory = {
        turns: [
          makeTurn({ turn_id: 1, role: 'user', content: 'Hi' }),
          {
            turn_id: 2,
            role: 'agent',
            content: '',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:01Z',
          },
        ],
      };
      const c = new GoldenCurator(traj);
      c.start({});
      const result = c.runQualityChecks();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validate', () => {
    it('should transition to validate step and populate validationResults', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      curator.autoAnnotate();
      const state = curator.validate();
      expect(state.step).toBe('validate');
      expect(state.validationResults).toBeDefined();
    });
  });

  describe('publish', () => {
    it('should return a GoldenTrajectory after successful validation', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      curator.autoAnnotate();
      curator.validate();
      const golden = curator.publish();
      expect(golden.id).toBeDefined();
      expect(golden.metadata.description).toBe('Test');
      expect(golden.trajectory.turns).toHaveLength(trajectory.turns.length);
    });

    it('should throw if trajectory is not validated', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      expect(() => curator.publish()).toThrow('Cannot publish invalid golden trajectory');
    });

    it('should throw if validation failed', () => {
      const traj: Trajectory = { turns: [] };
      const c = new GoldenCurator(traj);
      c.start({ description: 'Empty', tags: ['empty'] });
      c.validate();
      expect(() => c.publish()).toThrow('Cannot publish invalid golden trajectory');
    });

    it('should mark turns with annotations as expected', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      curator.annotateTurn({ turnId: 2, expected: true, qualityNotes: 'Good' });
      curator.annotateTurn({ turnId: 4, expected: true });
      curator.validate();
      const golden = curator.publish();
      const turn2 = golden.trajectory.turns.find((t) => t.turn_id === 2);
      expect(turn2?.expected).toBe(true);
      expect(turn2?.quality_notes).toBe('Good');
      const turn4 = golden.trajectory.turns.find((t) => t.turn_id === 4);
      expect(turn4?.expected).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return a copy of the state', () => {
      const state1 = curator.getState();
      const state2 = curator.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe('exportJSONL', () => {
    it('should export valid JSONL that can be re-parsed', () => {
      curator.start({ description: 'Test', tags: ['test'] });
      curator.autoAnnotate();
      const jsonl = curator.exportJSONL();
      const lines = jsonl.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      const metadataLine = JSON.parse(lines[0] ?? '');
      expect(metadataLine._golden_metadata).toBeDefined();
    });
  });
});

describe('createCurator', () => {
  it('should return a GoldenCurator instance', () => {
    const traj = makeTrajectory();
    const curator = createCurator(traj);
    expect(curator).toBeInstanceOf(GoldenCurator);
  });

  it('should initialize with the provided trajectory', () => {
    const traj = makeTrajectory();
    const curator = createCurator(traj);
    expect(curator.getState().trajectory).toBe(traj);
  });
});

describe('quickCreateGolden', () => {
  it('should create a valid golden trajectory in one step', () => {
    const traj = makeTrajectory();
    const golden = quickCreateGolden(traj, 'Quick test', ['test']);
    expect(golden.metadata.description).toBe('Quick test');
    expect(golden.metadata.tags).toEqual(['test']);
    expect(golden.trajectory.turns).toHaveLength(traj.turns.length);
  });

  it('should auto-annotate agent turns as expected', () => {
    const traj = makeTrajectory();
    const golden = quickCreateGolden(traj, 'Quick test', ['test']);
    const agentTurns = golden.trajectory.turns.filter((t) => t.role === 'agent');
    for (const turn of agentTurns) {
      expect(turn.expected).toBe(true);
    }
  });
});

describe('batchQualityCheck', () => {
  it('should run quality checks on multiple goldens', () => {
    const g1 = makeGolden({ id: 'g1' });
    const g2 = makeGolden({ id: 'g2' });
    const results = batchQualityCheck([g1, g2]);
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('g1');
    expect(results[1]?.id).toBe('g2');
    expect(results[0]?.result.passed).toBeDefined();
    expect(results[1]?.result.score).toBeGreaterThanOrEqual(0);
  });

  it('should return empty array for empty input', () => {
    const results = batchQualityCheck([]);
    expect(results).toHaveLength(0);
  });
});

describe('generateCurationReport', () => {
  it('should generate a text report for golden trajectories', () => {
    const g1 = makeGolden({ id: 'g1' });
    const report = generateCurationReport([g1]);
    expect(report).toContain('Golden Trajectory Curation Report');
    expect(report).toContain('Total trajectories: 1');
    expect(report).toContain('g1');
  });

  it('should include score and pass status for each golden', () => {
    const g1 = makeGolden({ id: 'g1' });
    const report = generateCurationReport([g1]);
    expect(report).toContain('Score:');
    expect(report).toContain('Passed:');
  });

  it('should handle empty goldens array', () => {
    const report = generateCurationReport([]);
    expect(report).toContain('Total trajectories: 0');
  });

  it('should include issues when present', () => {
    const g1 = makeGolden({ id: 'g1' });
    g1.trajectory = {
      turns: [
        makeTurn({ turn_id: 1, role: 'user', content: 'Hi' }),
        {
          turn_id: 2,
          role: 'agent',
          content: '',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };
    const report = generateCurationReport([g1]);
    expect(report).toContain('Issues:');
  });

  it('should include suggestions when present', () => {
    const g1 = makeGolden({ id: 'g1' });
    g1.metadata = {
      version: '1.0.0',
      createdAt: '2026-04-15T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
      description: '',
      tags: [],
    };
    const report = generateCurationReport([g1]);
    expect(report).toContain('Suggestions:');
  });
});
