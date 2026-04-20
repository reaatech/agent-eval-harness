import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TrajectoryLoadError,
  parseTurn,
  loadFromContent,
  loadFromFile,
  loadFromDirectory,
  serializeToJsonl,
  saveToFile,
} from '../../src/trajectory/loader.js';
import {
  evaluate,
  analyzeCoherence,
  analyzeGoalCompletion,
  analyzeConversationFlow,
} from '../../src/trajectory/evaluator.js';
import { compare } from '../../src/trajectory/comparator.js';
import type { Trajectory, Turn, GoldenTrajectory } from '../../src/types/domain.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const VALID_USER_LINE =
  '{"turn_id":1,"role":"user","content":"Hello","timestamp":"2026-04-15T23:00:00Z"}';
const VALID_AGENT_LINE =
  '{"turn_id":2,"role":"agent","content":"Hi there!","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z"}';
const VALID_TWO_TURN = `${VALID_USER_LINE}\n${VALID_AGENT_LINE}`;

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

describe('TrajectoryLoadError', () => {
  it('should set name and message', () => {
    const err = new TrajectoryLoadError('something broke');
    expect(err.name).toBe('TrajectoryLoadError');
    expect(err.message).toBe('something broke');
    expect(err).toBeInstanceOf(Error);
  });

  it('should carry optional cause and filePath', () => {
    const cause = new Error('root cause');
    const err = new TrajectoryLoadError('load failed', cause, '/tmp/traj.jsonl');
    expect(err.cause).toBe(cause);
    expect(err.filePath).toBe('/tmp/traj.jsonl');
  });
});

describe('parseTurn', () => {
  it('should parse a valid user turn', () => {
    const turn = parseTurn(VALID_USER_LINE, 1);
    expect(turn.turn_id).toBe(1);
    expect(turn.role).toBe('user');
    expect(turn.content).toBe('Hello');
    expect(turn.timestamp).toBe('2026-04-15T23:00:00Z');
  });

  it('should parse a valid agent turn with tool_calls', () => {
    const line = JSON.stringify({
      turn_id: 3,
      role: 'agent',
      content: 'done',
      tool_calls: [{ name: 'search', arguments: { q: 'test' }, result: { ok: true } }],
      timestamp: '2026-04-15T23:00:02Z',
    });
    const turn = parseTurn(line, 2);
    expect(turn.role).toBe('agent');
    expect(turn.tool_calls!).toHaveLength(1);
    expect(turn.tool_calls![0]!.name).toBe('search');
    expect(turn.tool_calls![0]!.result).toEqual({ ok: true });
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseTurn('{not valid}', 5)).toThrow();
  });

  it('should throw on missing required fields', () => {
    expect(() => parseTurn('{"turn_id":1}', 1)).toThrow();
  });

  it('should throw on invalid role value', () => {
    const line = JSON.stringify({
      turn_id: 1,
      role: 'system',
      content: 'hi',
      timestamp: '2026-04-15T23:00:00Z',
    });
    expect(() => parseTurn(line, 1)).toThrow();
  });

  it('should throw on non-positive turn_id', () => {
    const line = JSON.stringify({
      turn_id: 0,
      role: 'user',
      content: 'hi',
      timestamp: '2026-04-15T23:00:00Z',
    });
    expect(() => parseTurn(line, 1)).toThrow();
  });

  it('should parse turn with optional latency_ms', () => {
    const line = JSON.stringify({
      turn_id: 5,
      role: 'agent',
      content: 'fast',
      tool_calls: [],
      timestamp: '2026-04-15T23:00:00Z',
      latency_ms: 120,
    });
    const turn = parseTurn(line, 1);
    expect(turn.latency_ms).toBe(120);
  });

  it('should parse turn with optional cost', () => {
    const line = JSON.stringify({
      turn_id: 6,
      role: 'agent',
      content: 'costly',
      tool_calls: [],
      timestamp: '2026-04-15T23:00:00Z',
      cost: { input_tokens: 100, output_tokens: 50, total_cost: 0.002 },
    });
    const turn = parseTurn(line, 1);
    expect(turn.cost).toBeDefined();
    expect(turn.cost!.input_tokens).toBe(100);
    expect(turn.cost!.total_cost).toBe(0.002);
  });

  it('should throw on invalid timestamp format', () => {
    const line = JSON.stringify({
      turn_id: 1,
      role: 'user',
      content: 'hi',
      timestamp: 'not-a-date',
    });
    expect(() => parseTurn(line, 1)).toThrow();
  });
});

describe('loadFromContent', () => {
  it('should load a two-turn trajectory from JSONL string', () => {
    const traj = loadFromContent(VALID_TWO_TURN);
    expect(traj.turns).toHaveLength(2);
    expect(traj.turns[0]!.role).toBe('user');
    expect(traj.turns[1]!.role).toBe('agent');
  });

  it('should skip empty lines', () => {
    const content = `${VALID_USER_LINE}\n\n\n${VALID_AGENT_LINE}`;
    const traj = loadFromContent(content);
    expect(traj.turns).toHaveLength(2);
  });

  it('should skip comment lines', () => {
    const content = `${VALID_USER_LINE}\n# a comment\n${VALID_AGENT_LINE}`;
    const traj = loadFromContent(content);
    expect(traj.turns).toHaveLength(2);
  });

  it('should throw on empty content', () => {
    expect(() => loadFromContent('')).toThrow(TrajectoryLoadError);
    expect(() => loadFromContent('   \n  \n')).toThrow(TrajectoryLoadError);
  });

  it('should throw on invalid JSON line', () => {
    expect(() => loadFromContent('not json')).toThrow();
  });

  it('should throw on missing required fields in a line', () => {
    expect(() => loadFromContent('{"turn_id":1}')).toThrow();
  });

  it('should throw TrajectoryLoadError when agent turn is missing tool_calls', () => {
    const line = JSON.stringify({
      turn_id: 2,
      role: 'agent',
      content: 'no tools',
      timestamp: '2026-04-15T23:00:00Z',
    });
    expect(() => loadFromContent(`${VALID_USER_LINE}\n${line}`)).toThrow(TrajectoryLoadError);
  });

  it('should allow user and agent turns with the same turn_id', () => {
    const content = [
      '{"turn_id":1,"role":"user","content":"Hello","timestamp":"2026-04-15T23:00:00Z"}',
      '{"turn_id":1,"role":"agent","content":"Hi","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z"}',
    ].join('\n');
    const traj = loadFromContent(content);
    expect(traj.turns).toHaveLength(2);
    expect(traj.turns[0]!.role).toBe('user');
    expect(traj.turns[1]!.role).toBe('agent');
  });

  it('should throw on consecutive same-role turns with same turn_id', () => {
    const content = [
      '{"turn_id":1,"role":"user","content":"Hello","timestamp":"2026-04-15T23:00:00Z"}',
      '{"turn_id":1,"role":"user","content":"Hello again","timestamp":"2026-04-15T23:00:01Z"}',
    ].join('\n');
    expect(() => loadFromContent(content)).toThrow(TrajectoryLoadError);
  });

  it('should generate a trajectory_id by default', () => {
    const traj = loadFromContent(VALID_TWO_TURN);
    expect(traj.trajectory_id).toBeDefined();
    expect(traj.trajectory_id).toMatch(/^traj_/);
  });

  it('should skip trajectory_id generation when generateId is false', () => {
    const traj = loadFromContent(VALID_TWO_TURN, { generateId: false });
    expect(traj.trajectory_id).toBeUndefined();
  });

  it('should populate metadata with start_time, end_time, and total_turns', () => {
    const traj = loadFromContent(VALID_TWO_TURN);
    expect(traj.metadata).toBeDefined();
    expect(traj.metadata!.total_turns).toBe(2);
    expect(traj.metadata!.start_time).toBe('2026-04-15T23:00:00Z');
    expect(traj.metadata!.end_time).toBe('2026-04-15T23:00:01Z');
  });

  it('should compute total_cost from turns with cost data', () => {
    const userLine =
      '{"turn_id":1,"role":"user","content":"hi","timestamp":"2026-04-15T23:00:00Z"}';
    const agentLine = JSON.stringify({
      turn_id: 2,
      role: 'agent',
      content: 'yo',
      tool_calls: [],
      timestamp: '2026-04-15T23:00:01Z',
      cost: { input_tokens: 100, output_tokens: 50, total_cost: 0.003 },
    });
    const traj = loadFromContent(`${userLine}\n${agentLine}`);
    expect(traj.metadata!.total_cost).toBe(0.003);
  });

  it('should accept loadFromContent with validate=false', () => {
    const traj = loadFromContent(VALID_TWO_TURN, { validate: false });
    expect(traj.turns).toHaveLength(2);
  });

  it('should handle multi-turn conversation', () => {
    const content = [
      '{"turn_id":1,"role":"user","content":"Reset my password","timestamp":"2026-04-15T23:00:00Z"}',
      '{"turn_id":2,"role":"agent","content":"What is your email?","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z"}',
      '{"turn_id":3,"role":"user","content":"john@example.com","timestamp":"2026-04-15T23:00:05Z"}',
      '{"turn_id":4,"role":"agent","content":"Password reset sent!","tool_calls":[{"name":"send_reset_email","arguments":{"email":"john@example.com"},"result":{"status":"sent"}}],"timestamp":"2026-04-15T23:00:06Z"}',
    ].join('\n');
    const traj = loadFromContent(content);
    expect(traj.turns).toHaveLength(4);
    expect(traj.metadata!.total_turns).toBe(4);
  });
});

describe('loadFromFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should load trajectory from a file', async () => {
    const filePath = path.join(tmpDir, 'traj.jsonl');
    fs.writeFileSync(filePath, VALID_TWO_TURN, 'utf-8');
    const traj = await loadFromFile(filePath);
    expect(traj.turns).toHaveLength(2);
  });

  it('should throw TrajectoryLoadError when file does not exist', async () => {
    await expect(loadFromFile('/nonexistent/path/traj.jsonl')).rejects.toThrow(TrajectoryLoadError);
  });

  it('should include filePath in error when file not found', async () => {
    const missing = '/nonexistent/path/traj.jsonl';
    try {
      await loadFromFile(missing);
    } catch (e) {
      expect(e).toBeInstanceOf(TrajectoryLoadError);
      expect((e as TrajectoryLoadError).filePath).toContain('nonexistent');
      return;
    }
    expect.unreachable('should have thrown');
  });

  it('should pass options through to loadFromContent', async () => {
    const filePath = path.join(tmpDir, 'traj.jsonl');
    fs.writeFileSync(filePath, VALID_TWO_TURN, 'utf-8');
    const traj = await loadFromFile(filePath, { generateId: false });
    expect(traj.trajectory_id).toBeUndefined();
  });

  it('should throw TrajectoryLoadError on read failure', async () => {
    const filePath = path.join(tmpDir, 'traj.jsonl');
    fs.writeFileSync(filePath, VALID_TWO_TURN, 'utf-8');
    fs.chmodSync(filePath, 0o000);
    try {
      await expect(loadFromFile(filePath)).rejects.toThrow(TrajectoryLoadError);
    } finally {
      fs.chmodSync(filePath, 0o644);
    }
  });
});

describe('loadFromDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-harness-dir-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should load all .jsonl files from a directory', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), VALID_TWO_TURN, 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'b.jsonl'), VALID_TWO_TURN, 'utf-8');
    const trajs = await loadFromDirectory(tmpDir);
    expect(trajs).toHaveLength(2);
  });

  it('should ignore non-.jsonl files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), VALID_TWO_TURN, 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'not a jsonl', 'utf-8');
    const trajs = await loadFromDirectory(tmpDir);
    expect(trajs).toHaveLength(1);
  });

  it('should throw when directory does not exist', async () => {
    await expect(loadFromDirectory('/nonexistent/dir')).rejects.toThrow(TrajectoryLoadError);
  });

  it('should throw when all files fail and no trajectories loaded', async () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.jsonl'), 'not valid jsonl', 'utf-8');
    await expect(loadFromDirectory(tmpDir)).rejects.toThrow(TrajectoryLoadError);
  });

  it('should skip bad files and return successful loads', async () => {
    fs.writeFileSync(path.join(tmpDir, 'good.jsonl'), VALID_TWO_TURN, 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'bad.jsonl'), 'not valid', 'utf-8');
    const trajs = await loadFromDirectory(tmpDir);
    expect(trajs).toHaveLength(1);
  });

  it('should pass options to loadFromFile', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.jsonl'), VALID_TWO_TURN, 'utf-8');
    const trajs = await loadFromDirectory(tmpDir, { generateId: false });
    expect(trajs[0]!.trajectory_id).toBeUndefined();
  });

  it('should return empty array for directory with no .jsonl files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hello', 'utf-8');
    const trajs = await loadFromDirectory(tmpDir);
    expect(trajs).toHaveLength(0);
  });
});

describe('serializeToJsonl', () => {
  it('should serialize a trajectory to JSONL string', () => {
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
    const jsonl = serializeToJsonl(traj);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    const parsed0 = JSON.parse(lines[0]!);
    expect(parsed0.role).toBe('user');
    expect(parsed0.content).toBe('Hello');
    const parsed1 = JSON.parse(lines[1]!);
    expect(parsed1.role).toBe('agent');
  });

  it('should produce valid JSONL that can be re-parsed', () => {
    const original = loadFromContent(VALID_TWO_TURN);
    const jsonl = serializeToJsonl(original);
    const reparsed = loadFromContent(jsonl);
    expect(reparsed.turns).toHaveLength(original.turns.length);
    expect(reparsed.turns[0]!.content).toBe(original.turns[0]!.content);
    expect(reparsed.turns[1]!.content).toBe(original.turns[1]!.content);
  });
});

describe('saveToFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write trajectory to file as JSONL', async () => {
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
    const filePath = path.join(tmpDir, 'out.jsonl');
    await saveToFile(traj, filePath);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('should produce a file loadable by loadFromFile', async () => {
    const original = loadFromContent(VALID_TWO_TURN);
    const filePath = path.join(tmpDir, 'roundtrip.jsonl');
    await saveToFile(original, filePath);
    const loaded = await loadFromFile(filePath);
    expect(loaded.turns).toHaveLength(2);
    expect(loaded.turns[0]!.content).toBe('Hello');
  });
});

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
    const nameIssue = result.issues!.find((i) => i.type === 'missing_tool_name');
    expect(nameIssue).toBeDefined();
    expect(nameIssue!.severity).toBe('high');
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
    const argIssue = result.issues!.find((i) => i.type === 'missing_tool_arguments');
    expect(argIssue).toBeDefined();
    expect(argIssue!.severity).toBe('medium');
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
    expect(result.turnTransitions[0]!.from).toBe(1);
    expect(result.turnTransitions[0]!.to).toBe(2);
    expect(result.turnTransitions[0]!.coherent).toBe(true);
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
    expect(result.unresolvedTurns!.length).toBeGreaterThan(0);
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
    expect(agentTurnComp!.differences.length).toBeGreaterThan(0);
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
    expect(missingReg!.severity).toBe('critical');
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
    expect(simReg!.turnId).toBe(2);
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
    expect(result.turnComparisons[0]!.matches).toBe(true);
    expect(result.turnComparisons[1]!.matches).toBe(true);
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
