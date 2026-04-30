import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import {
  analyzeCoherence,
  analyzeConversationFlow,
  analyzeGoalCompletion,
  evaluate,
} from './evaluator.js';

function makeTrajectory(turns: Turn[]): Trajectory {
  return { turns };
}

describe('evaluate', () => {
  it('should return an EvalResult with required fields', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'What is 2+2?', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: '2+2 equals 4.',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = evaluate(traj);
    expect(result.trajectory_id).toBeDefined();
    expect(typeof result.overall_score).toBe('number');
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(1);
    expect(result.metrics).toBeDefined();
    expect(result.issues).toBeInstanceOf(Array);
    expect(typeof result.passed).toBe('boolean');
    expect(result.evaluated_at).toBeDefined();
  });

  it('should return passed=true for a coherent trajectory with goal completion', () => {
    const traj = makeTrajectory([
      {
        turn_id: 1,
        role: 'user',
        content: 'Set a timer for 5 minutes',
        timestamp: '2026-04-15T23:00:00Z',
      },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Timer set! All done.',
        tool_calls: [{ name: 'set_timer', arguments: { minutes: 5 }, result: { id: 't1' } }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = evaluate(traj);
    expect(result.passed).toBe(true);
    expect(result.overall_score).toBeGreaterThan(0.5);
  });

  it('should include coherence metric by default', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi there!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = evaluate(traj);
    expect(result.metrics.coherence).toBeDefined();
    expect(typeof result.metrics.coherence).toBe('number');
  });

  it('should include goal_completion metric by default', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi there!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = evaluate(traj);
    expect(result.metrics.goal_completion).toBeDefined();
  });

  it('should respect checkCoherence=false option', () => {
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
    const result = evaluate(traj, { checkCoherence: false });
    expect(result.metrics.coherence).toBeUndefined();
  });

  it('should respect checkGoalCompletion=false option', () => {
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
    const result = evaluate(traj, { checkGoalCompletion: false });
    expect(result.metrics.goal_completion).toBeUndefined();
  });

  it('should detect missing tool name as high-severity issue', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Do stuff', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Ok',
        tool_calls: [{ name: '', arguments: {} }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = evaluate(traj);
    const nameIssue = result.issues?.find((i) => i.type === 'missing_tool_name');
    expect(nameIssue).toBeDefined();
    expect(nameIssue?.severity).toBe('high');
  });

  it('should detect missing tool arguments as medium-severity issue', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Search for cats', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Searching',
        tool_calls: [
          { name: 'search', arguments: undefined as unknown as Record<string, unknown> },
        ],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = evaluate(traj);
    const argIssue = result.issues?.find((i) => i.type === 'missing_tool_arguments');
    expect(argIssue).toBeDefined();
    expect(argIssue?.severity).toBe('medium');
  });

  it('should use trajectory_id from trajectory', () => {
    const traj: Trajectory = {
      trajectory_id: 'my-traj-42',
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
    };
    const result = evaluate(traj);
    expect(result.trajectory_id).toBe('my-traj-42');
  });
});

describe('analyzeCoherence', () => {
  it('should return score, issues, and turnTransitions', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi there!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeCoherence(traj);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.issues).toBeInstanceOf(Array);
    expect(result.turnTransitions).toBeInstanceOf(Array);
  });

  it('should return score 1 for a coherent sequential conversation', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'What is 2+2?', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'The answer is 4.',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeCoherence(traj);
    expect(result.score).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect tool calls without results', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Search for cats', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Searching',
        tool_calls: [{ name: 'search', arguments: { q: 'cats' } }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeCoherence(traj);
    expect(result.issues.some((i) => i.includes('no result'))).toBe(true);
    expect(result.score).toBeLessThan(1);
  });

  it('should detect gap in turn sequence', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hello',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 5, role: 'user', content: 'Bye', timestamp: '2026-04-15T23:00:02Z' },
      {
        turn_id: 6,
        role: 'agent',
        content: 'See ya',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const result = analyzeCoherence(traj);
    const gap = result.turnTransitions.find((t) => !t.coherent && t.reason?.includes('Gap'));
    expect(gap).toBeDefined();
    expect(result.score).toBeLessThan(1);
  });

  it('should handle single-turn trajectory', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
    ]);
    const result = analyzeCoherence(traj);
    expect(result.score).toBe(1);
    expect(result.turnTransitions).toHaveLength(0);
  });

  it('should return turnTransitions with from and to fields', () => {
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
    const result = analyzeCoherence(traj);
    expect(result.turnTransitions).toHaveLength(1);
    expect(result.turnTransitions[0]?.from).toBe(1);
    expect(result.turnTransitions[0]?.to).toBe(2);
    expect(result.turnTransitions[0]?.coherent).toBe(true);
  });
});

describe('analyzeGoalCompletion', () => {
  it('should detect completed goal with completion indicator', () => {
    const traj = makeTrajectory([
      {
        turn_id: 1,
        role: 'user',
        content: 'Set a timer for 5 minutes',
        timestamp: '2026-04-15T23:00:00Z',
      },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Timer set! All done.',
        tool_calls: [{ name: 'set_timer', arguments: { minutes: 5 }, result: { id: 't1' } }],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeGoalCompletion(traj);
    expect(result.completed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should detect incomplete goal without completion indicator', () => {
    const traj = makeTrajectory([
      {
        turn_id: 1,
        role: 'user',
        content: 'Set a timer for 5 minutes',
        timestamp: '2026-04-15T23:00:00Z',
      },
      {
        turn_id: 2,
        role: 'agent',
        content: 'I can help with that.',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeGoalCompletion(traj);
    expect(result.completed).toBe(false);
  });

  it('should return confidence 0 when no agent turn exists', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
    ]);
    const result = analyzeGoalCompletion(traj);
    expect(result.completed).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('should detect failed tool calls', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Send email', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Done',
        tool_calls: [
          { name: 'send_email', arguments: { to: 'a@b.c' }, result: { status: 'error' } },
        ],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeGoalCompletion(traj);
    expect(result.completed).toBe(false);
    expect(result.evidence.some((e) => e.includes('failed'))).toBe(true);
  });

  it('should include evidence array', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Reset password', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Password reset sent!',
        tool_calls: [
          { name: 'send_email', arguments: { email: 'a@b.c' }, result: { status: 'sent' } },
        ],
        timestamp: '2026-04-15T23:00:01Z',
      },
    ]);
    const result = analyzeGoalCompletion(traj);
    expect(result.evidence).toBeInstanceOf(Array);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should report unresolvedTurns when user last message lacks matching agent response', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hello',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'Help me', timestamp: '2026-04-15T23:00:02Z' },
    ]);
    const result = analyzeGoalCompletion(traj);
    expect(result.unresolvedTurns).toBeDefined();
    expect(result.unresolvedTurns?.length).toBeGreaterThan(0);
  });
});

describe('analyzeConversationFlow', () => {
  it('should return flow analysis with required fields', () => {
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
    const result = analyzeConversationFlow(traj);
    expect(typeof result.avgTurnsPerTopic).toBe('number');
    expect(typeof result.topicChanges).toBe('number');
    expect(typeof result.interruptions).toBe('number');
    expect(typeof result.flowScore).toBe('number');
  });

  it('should detect no interruptions in balanced conversation', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'Hello again', timestamp: '2026-04-15T23:00:02Z' },
      {
        turn_id: 4,
        role: 'agent',
        content: 'See ya!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const result = analyzeConversationFlow(traj);
    expect(result.interruptions).toBe(0);
    expect(result.flowScore).toBe(1);
  });

  it('should detect interruptions when user turns outnumber agent turns', () => {
    const traj = makeTrajectory([
      { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Hi!',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      { turn_id: 3, role: 'user', content: 'Another question', timestamp: '2026-04-15T23:00:02Z' },
    ]);
    const result = analyzeConversationFlow(traj);
    expect(result.interruptions).toBeGreaterThan(0);
    expect(result.flowScore).toBeLessThan(1);
  });

  it('should detect topic changes between dissimilar user messages', () => {
    const traj = makeTrajectory([
      {
        turn_id: 1,
        role: 'user',
        content: 'Tell me about quantum physics entanglement',
        timestamp: '2026-04-15T23:00:00Z',
      },
      {
        turn_id: 2,
        role: 'agent',
        content: 'Quantum entanglement is...',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:01Z',
      },
      {
        turn_id: 3,
        role: 'user',
        content: 'What is the recipe for banana bread baking?',
        timestamp: '2026-04-15T23:00:02Z',
      },
      {
        turn_id: 4,
        role: 'agent',
        content: 'Here is a banana bread recipe...',
        tool_calls: [],
        timestamp: '2026-04-15T23:00:03Z',
      },
    ]);
    const result = analyzeConversationFlow(traj);
    expect(result.topicChanges).toBeGreaterThan(0);
  });
});
