import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TrajectoryLoadError,
  loadFromContent,
  loadFromDirectory,
  loadFromFile,
  parseTurn,
  saveToFile,
  serializeToJsonl,
} from './loader.js';

const VALID_USER_LINE =
  '{"turn_id":1,"role":"user","content":"Hello","timestamp":"2026-04-15T23:00:00Z"}';
const VALID_AGENT_LINE =
  '{"turn_id":2,"role":"agent","content":"Hi there!","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z"}';
const VALID_TWO_TURN = `${VALID_USER_LINE}\n${VALID_AGENT_LINE}`;

function makeTrajectory(turns: Turn[]): Trajectory {
  return { turns };
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
    expect(turn.tool_calls).toHaveLength(1);
    expect(turn.tool_calls?.[0]?.name).toBe('search');
    expect(turn.tool_calls?.[0]?.result).toEqual({ ok: true });
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
    expect(turn.cost?.input_tokens).toBe(100);
    expect(turn.cost?.total_cost).toBe(0.002);
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
    expect(traj.turns[0]?.role).toBe('user');
    expect(traj.turns[1]?.role).toBe('agent');
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
    expect(traj.turns[0]?.role).toBe('user');
    expect(traj.turns[1]?.role).toBe('agent');
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
    expect(traj.metadata?.total_turns).toBe(2);
    expect(traj.metadata?.start_time).toBe('2026-04-15T23:00:00Z');
    expect(traj.metadata?.end_time).toBe('2026-04-15T23:00:01Z');
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
    expect(traj.metadata?.total_cost).toBe(0.003);
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
    expect(traj.metadata?.total_turns).toBe(4);
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
    expect(trajs[0]?.trajectory_id).toBeUndefined();
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
    const parsed0 = JSON.parse(lines[0] ?? '');
    expect(parsed0.role).toBe('user');
    expect(parsed0.content).toBe('Hello');
    const parsed1 = JSON.parse(lines[1] ?? '');
    expect(parsed1.role).toBe('agent');
  });

  it('should produce valid JSONL that can be re-parsed', () => {
    const original = loadFromContent(VALID_TWO_TURN);
    const jsonl = serializeToJsonl(original);
    const reparsed = loadFromContent(jsonl);
    expect(reparsed.turns).toHaveLength(original.turns.length);
    expect(reparsed.turns[0]?.content).toBe(original.turns[0]?.content);
    expect(reparsed.turns[1]?.content).toBe(original.turns[1]?.content);
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
    expect(loaded.turns[0]?.content).toBe('Hello');
  });
});
