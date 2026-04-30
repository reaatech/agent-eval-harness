import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GoldenCurator,
  batchQualityCheck,
  createCurator,
  generateCurationReport,
  quickCreateGolden,
} from './curator.js';
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
