import { describe, it, expect } from 'vitest';
import { loadFromContent, TrajectoryLoadError } from '../../src/trajectory/loader.js';
import { evaluate } from '../../src/trajectory/evaluator.js';
import { validateToolCall, validateTrajectory } from '../../src/tool-use/validator.js';
import { calculateTrajectoryCost } from '../../src/cost/tracker.js';
import { monitorLatency } from '../../src/latency/monitor.js';
import { GateEngine, createGateEngine } from '../../src/gate/engine.js';
import type { Trajectory, ToolCall } from '../../src/types/domain.js';
import type { AggregatedResults, MetricBreakdown } from '../../src/suite/results.js';
import type { ToolSchema } from '../../src/tool-use/validator.js';

const goodJsonl = [
  '{"turn_id":1,"role":"user","content":"Reset my password","timestamp":"2026-04-15T23:00:00Z"}',
  '{"turn_id":2,"role":"agent","content":"I can help with that. What is your email?","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z","latency_ms":1200,"cost":{"input_tokens":150,"output_tokens":45}}',
  '{"turn_id":3,"role":"user","content":"john@example.com","timestamp":"2026-04-15T23:00:05Z"}',
  '{"turn_id":4,"role":"agent","content":"Password reset sent successfully!","tool_calls":[{"name":"send_reset_email","arguments":{"to":"john@example.com"},"result":{"status":"sent"}}],"timestamp":"2026-04-15T23:00:06Z","latency_ms":800,"cost":{"input_tokens":120,"output_tokens":32}}',
].join('\n');

const poorJsonl = [
  '{"turn_id":1,"role":"user","content":"Reset my password","timestamp":"2026-04-15T23:00:00Z"}',
  '{"turn_id":2,"role":"agent","content":"I do not understand.","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z","latency_ms":3000,"cost":{"input_tokens":200,"output_tokens":80}}',
].join('\n');

function makeAggregatedResults(
  overrides: Record<
    string,
    {
      avgScore: number;
      minScore?: number;
      maxScore?: number;
      stdDev?: number;
      passRate?: number;
      weight?: number;
    }
  >,
): AggregatedResults {
  const metricBreakdown: Record<string, MetricBreakdown> = {};
  for (const [key, val] of Object.entries(overrides)) {
    metricBreakdown[key] = {
      name: key,
      avgScore: val.avgScore,
      minScore: val.minScore ?? val.avgScore,
      maxScore: val.maxScore ?? val.avgScore,
      stdDev: val.stdDev ?? 0,
      passRate: val.passRate ?? 1,
      weight: val.weight ?? 1,
    };
  }
  return {
    runId: 'test-run-1',
    config: { name: 'test-suite', metrics: [] },
    overallMetrics: {
      overallScore: overrides['overall_score']?.avgScore ?? 0,
      avgFaithfulness: 0,
      avgRelevance: 0,
      toolCorrectnessRate: 0,
      avgCostPerTask: 0,
      latencyP50: 0,
      latencyP90: 0,
      latencyP99: 0,
      slaViolations: 0,
    },
    metricBreakdown,
    trajectoryResults: [],
    summary: {
      totalTrajectories: 1,
      passedTrajectories: 1,
      failedTrajectories: 0,
      passRate: 100,
      overallPassed: true,
      durationMs: 500,
    },
    timestamp: '2026-04-15T23:00:00Z',
  };
}

describe('End-to-End Eval Pipeline', () => {
  it('should run complete evaluation pipeline from JSONL to gate evaluation', () => {
    const trajectory = loadFromContent(goodJsonl);

    const evalResult = evaluate(trajectory);
    expect(evalResult.overall_score).toBeGreaterThan(0);
    expect(evalResult.passed).toBe(true);
    expect(evalResult.trajectory_id).toBeDefined();
    expect(evalResult.evaluated_at).toBeDefined();

    const agentTurnsWithTools = trajectory.turns.filter(
      (t) => t.role === 'agent' && t.tool_calls && t.tool_calls.length > 0,
    );
    for (const turn of agentTurnsWithTools) {
      for (const tc of turn.tool_calls!) {
        const vr = validateToolCall(tc);
        expect(vr.score).toBeGreaterThan(0);
      }
    }

    const costResult = calculateTrajectoryCost(trajectory, 'claude-opus');
    expect(costResult.total_cost).toBeGreaterThan(0);
    expect(costResult.llm_cost).toBeGreaterThan(0);

    const latencyResult = monitorLatency(trajectory);
    expect(latencyResult.totalLatencyMs).toBeGreaterThan(0);
    expect(latencyResult.turnCount).toBe(2);

    const aggregated = makeAggregatedResults({
      overall_score: { avgScore: evalResult.overall_score },
    });

    const engine = createGateEngine([
      {
        name: 'quality-gate',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.5,
      },
    ]);
    const gateSummary = engine.evaluate(aggregated);
    expect(gateSummary.overallPassed).toBe(true);
    expect(gateSummary.passedGates).toBe(1);
    expect(gateSummary.failedGates).toBe(0);
  });

  it('should detect quality regressions in poor trajectories', () => {
    const trajectory = loadFromContent(poorJsonl);

    const evalResult = evaluate(trajectory);
    expect(evalResult.passed).toBe(false);
    expect(evalResult.issues!.some((i) => i.severity === 'high')).toBe(true);

    const aggregated = makeAggregatedResults({
      overall_score: { avgScore: evalResult.overall_score },
    });

    const engine = createGateEngine([
      {
        name: 'quality-gate',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      },
    ]);
    const gateSummary = engine.evaluate(aggregated);
    expect(gateSummary.overallPassed).toBe(false);
    expect(gateSummary.failedGates).toBe(1);
  });

  it('should process multiple trajectories through the pipeline', () => {
    const good = loadFromContent(goodJsonl);
    const poor = loadFromContent(poorJsonl);

    const results = [good, poor].map((t) => evaluate(t));
    const scores = results.map((r) => r.overall_score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    expect(avgScore).toBeGreaterThan(0);
    expect(avgScore).toBeLessThanOrEqual(1);
    expect(results[0]!.overall_score).toBeGreaterThan(results[1]!.overall_score);
  });
});

describe('Trajectory Loading', () => {
  it('should parse valid JSONL into a Trajectory', () => {
    const trajectory = loadFromContent(goodJsonl);
    expect(trajectory.turns).toHaveLength(4);
    expect(trajectory.turns[0]!.role).toBe('user');
    expect(trajectory.turns[0]!.content).toBe('Reset my password');
    expect(trajectory.turns[1]!.role).toBe('agent');
    expect(trajectory.turns[1]!.tool_calls).toEqual([]);
    expect(trajectory.turns[3]!.tool_calls).toHaveLength(1);
    expect(trajectory.turns[3]!.tool_calls![0]!.name).toBe('send_reset_email');
  });

  it('should generate trajectory_id by default', () => {
    const trajectory = loadFromContent(goodJsonl);
    expect(trajectory.trajectory_id).toBeDefined();
    expect(trajectory.trajectory_id).toMatch(/^traj_/);
  });

  it('should omit trajectory_id when generateId is false', () => {
    const trajectory = loadFromContent(goodJsonl, { generateId: false });
    expect(trajectory.trajectory_id).toBeUndefined();
  });

  it('should include computed metadata', () => {
    const trajectory = loadFromContent(goodJsonl);
    expect(trajectory.metadata).toBeDefined();
    expect(trajectory.metadata!.total_turns).toBe(4);
    expect(trajectory.metadata!.start_time).toBe('2026-04-15T23:00:00Z');
    expect(trajectory.metadata!.end_time).toBe('2026-04-15T23:00:06Z');
  });

  it('should throw TrajectoryLoadError on empty content', () => {
    expect(() => loadFromContent('')).toThrow(TrajectoryLoadError);
    expect(() => loadFromContent('   \n  \n  ')).toThrow(TrajectoryLoadError);
  });

  it('should throw on invalid JSON', () => {
    expect(() => loadFromContent('not json')).toThrow();
    expect(() => loadFromContent('{invalid}')).toThrow();
  });

  it('should throw when agent turn is missing tool_calls', () => {
    const jsonl =
      '{"turn_id":1,"role":"user","content":"Hi","timestamp":"2026-04-15T23:00:00Z"}\n{"turn_id":2,"role":"agent","content":"Hello","timestamp":"2026-04-15T23:00:01Z"}';
    expect(() => loadFromContent(jsonl)).toThrow(TrajectoryLoadError);
  });

  it('should skip comment lines and empty lines', () => {
    const jsonl =
      '# comment\n\n{"turn_id":1,"role":"user","content":"Hi","timestamp":"2026-04-15T23:00:00Z"}\n{"turn_id":2,"role":"agent","content":"Hello","tool_calls":[],"timestamp":"2026-04-15T23:00:01Z"}\n';
    const trajectory = loadFromContent(jsonl);
    expect(trajectory.turns).toHaveLength(2);
  });
});

describe('Quality Evaluation', () => {
  it('should score a coherent trajectory highly', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'test-good',
      turns: [
        {
          turn_id: 1,
          role: 'user',
          content: 'Reset my password',
          timestamp: '2026-04-15T23:00:00Z',
        },
        {
          turn_id: 1,
          role: 'agent',
          content: 'I can help with that! What is your email?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
        {
          turn_id: 2,
          role: 'user',
          content: 'john@example.com',
          timestamp: '2026-04-15T23:00:05Z',
        },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Password reset sent successfully!',
          tool_calls: [
            {
              name: 'send_reset_email',
              arguments: { to: 'john@example.com' },
              result: { status: 'sent' },
            },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };

    const result = evaluate(trajectory);
    expect(result.overall_score).toBeGreaterThan(0.7);
    expect(result.passed).toBe(true);
    expect(result.metrics.coherence).toBeGreaterThan(0.5);
    expect(result.metrics.goal_completion).toBeGreaterThan(0.5);
    expect(result.trajectory_id).toBe('test-good');
  });

  it('should flag incoherent trajectories', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'test-bad',
      turns: [
        {
          turn_id: 1,
          role: 'user',
          content: 'What is the weather?',
          timestamp: '2026-04-15T23:00:00Z',
        },
        {
          turn_id: 2,
          role: 'agent',
          content: 'I like turtles.',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };

    const result = evaluate(trajectory);
    expect(result.overall_score).toBeLessThan(1.0);
    expect(result.passed).toBe(false);
    expect(result.issues!.some((i) => i.severity === 'high')).toBe(true);
  });

  it('should detect goal completion via completion indicators', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'test-complete',
      turns: [
        { turn_id: 1, role: 'user', content: 'Send an email', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 1,
          role: 'agent',
          content: 'Email sent successfully!',
          tool_calls: [
            { name: 'send_email', arguments: { to: 'a@b.com' }, result: { status: 'sent' } },
          ],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };

    const result = evaluate(trajectory);
    expect(result.metrics.goal_completion).toBeGreaterThan(0.5);
  });

  it('should detect incomplete goals', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'test-incomplete',
      turns: [
        {
          turn_id: 1,
          role: 'user',
          content: 'Send an email to john',
          timestamp: '2026-04-15T23:00:00Z',
        },
        {
          turn_id: 1,
          role: 'agent',
          content: 'What email provider do they use?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };

    const result = evaluate(trajectory);
    expect(result.issues!.some((i) => i.type === 'incomplete_goal')).toBe(true);
  });

  it('should return correct EvalResult structure', () => {
    const trajectory: Trajectory = {
      turns: [
        { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hi there!',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };

    const result = evaluate(trajectory);
    expect(result).toHaveProperty('trajectory_id');
    expect(result).toHaveProperty('overall_score');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('evaluated_at');
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(1);
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

describe('Tool Use Validation', () => {
  it('should validate a correct tool call', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'john@example.com', subject: 'Hello' },
      result: { status: 'sent' },
    };

    const result = validateToolCall(toolCall, undefined, { allowUnknownTools: true });
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.issues).toHaveLength(0);
  });

  it('should flag empty tool name', () => {
    const toolCall: ToolCall = {
      name: '',
      arguments: { to: 'test@test.com' },
    };

    const result = validateToolCall(toolCall);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing_tool_name')).toBe(true);
    expect(result.score).toBeLessThan(1);
  });

  it('should validate required parameters against schema', () => {
    const schema: ToolSchema = {
      name: 'send_email',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
        },
        required: ['to', 'subject'],
      },
    };

    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'john@example.com' },
    };

    const result = validateToolCall(toolCall, schema);
    expect(result.issues.some((i) => i.type === 'missing_required_param')).toBe(true);
  });

  it('should detect type mismatches in arguments', () => {
    const schema: ToolSchema = {
      name: 'set_count',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      },
    };

    const toolCall: ToolCall = {
      name: 'set_count',
      arguments: { count: 'five' },
    };

    const result = validateToolCall(toolCall, schema);
    expect(result.issues.some((i) => i.type === 'type_mismatch')).toBe(true);
  });

  it('should flag unknown tools in strict mode', () => {
    const toolCall: ToolCall = {
      name: 'unknown_tool',
      arguments: { key: 'value' },
    };

    const result = validateToolCall(toolCall, undefined, { strict: true });
    expect(result.issues.some((i) => i.type === 'unknown_tool')).toBe(true);
  });

  it('should allow unknown tools when configured', () => {
    const toolCall: ToolCall = {
      name: 'unknown_tool',
      arguments: { key: 'value' },
      result: { ok: true },
    };

    const result = validateToolCall(toolCall, undefined, { allowUnknownTools: true });
    expect(result.issues.filter((i) => i.type === 'unknown_tool')).toHaveLength(0);
  });

  it('should detect deprecated tools', () => {
    const schema: ToolSchema = {
      name: 'old_tool',
      parameters: { type: 'object', properties: {} },
      deprecated: true,
      replacedBy: 'new_tool',
    };

    const toolCall: ToolCall = {
      name: 'old_tool',
      arguments: {},
      result: { ok: true },
    };

    const result = validateToolCall(toolCall, schema);
    expect(result.issues.some((i) => i.type === 'deprecated_tool')).toBe(true);
    expect(result.suggestions).toContain('Replace "old_tool" with "new_tool"');
  });

  it('should validate all tool calls in a trajectory', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'traj-tools',
      turns: [
        { turn_id: 1, role: 'user', content: 'Send email', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Sending',
          tool_calls: [
            { name: 'send_email', arguments: { to: 'a@b.com' }, result: { status: 'sent' } },
          ],
          timestamp: '2026-04-15T23:00:01Z',
        },
        { turn_id: 3, role: 'user', content: 'Also send SMS', timestamp: '2026-04-15T23:00:05Z' },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Sent',
          tool_calls: [
            { name: 'send_sms', arguments: { to: '1234567890' }, result: { status: 'sent' } },
          ],
          timestamp: '2026-04-15T23:00:06Z',
        },
      ],
    };

    const results = validateTrajectory(trajectory);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.valid)).toBe(true);
  });
});

describe('Cost Tracking', () => {
  it('should calculate cost with explicit token counts', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'cost-test',
      turns: [
        { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hi there!',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          cost: { input_tokens: 1000, output_tokens: 200 },
        },
        { turn_id: 3, role: 'user', content: 'How are you?', timestamp: '2026-04-15T23:00:05Z' },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Doing well!',
          tool_calls: [{ name: 'log', arguments: { msg: 'greeting' } }],
          timestamp: '2026-04-15T23:00:06Z',
          cost: { input_tokens: 500, output_tokens: 100 },
        },
      ],
    };

    const result = calculateTrajectoryCost(trajectory, 'claude-opus');
    expect(result.total_cost).toBeGreaterThan(0);
    expect(result.llm_cost).toBeGreaterThan(0);
    expect(result.input_tokens).toBe(1500);
    expect(result.output_tokens).toBe(300);
    expect(result.per_turn).toHaveLength(2);
  });

  it('should estimate tokens from content length when cost data missing', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'cost-estimate',
      turns: [
        { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hi there, how can I help you today?',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
        },
      ],
    };

    const result = calculateTrajectoryCost(trajectory, 'gpt-4-turbo');
    expect(result.total_cost).toBeGreaterThan(0);
    expect(result.input_tokens).toBeGreaterThan(0);
    expect(result.output_tokens).toBeGreaterThan(0);
  });

  it('should use different provider pricing', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'multi-provider',
      turns: [
        { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hello!',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          cost: { input_tokens: 1000, output_tokens: 100 },
        },
      ],
    };

    const opusCost = calculateTrajectoryCost(trajectory, 'claude-opus');
    const turboCost = calculateTrajectoryCost(trajectory, 'gpt-4-turbo');
    const haikuCost = calculateTrajectoryCost(trajectory, 'claude-haiku');

    expect(opusCost.total_cost).toBeGreaterThan(turboCost.total_cost);
    expect(turboCost.total_cost).toBeGreaterThan(haikuCost.total_cost);
  });

  it('should include tool invocation costs', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'tool-costs',
      turns: [
        { turn_id: 1, role: 'user', content: 'Send it', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Done',
          tool_calls: [
            { name: 'tool_a', arguments: {}, result: {} },
            { name: 'tool_b', arguments: {}, result: {} },
            { name: 'tool_c', arguments: {}, result: {} },
          ],
          timestamp: '2026-04-15T23:00:01Z',
          cost: { input_tokens: 100, output_tokens: 50 },
        },
      ],
    };

    const result = calculateTrajectoryCost(trajectory, 'gpt-4-turbo');
    expect(result.tool_cost).toBeGreaterThan(0);
    expect(result.per_turn![0]!.tool_cost).toBeGreaterThan(0);
  });

  it('should throw on unknown provider without custom pricing', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'unknown-provider',
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

    expect(() => calculateTrajectoryCost(trajectory, 'nonexistent-model')).toThrow();
  });

  it('should accept custom pricing', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'custom-pricing',
      turns: [
        { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hello',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          cost: { input_tokens: 1000, output_tokens: 100 },
        },
      ],
    };

    const result = calculateTrajectoryCost(trajectory, 'my-model', {
      customPricing: { 'my-model': { input: 5.0, output: 10.0 } },
    });
    expect(result.total_cost).toBeGreaterThan(0);
    expect(result.llm_cost).toBeGreaterThan(0);
  });
});

describe('Latency Monitoring', () => {
  it('should calculate latency statistics from agent turns', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'latency-test',
      turns: [
        { turn_id: 1, role: 'user', content: 'Hello', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'Hi!',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          latency_ms: 1200,
        },
        { turn_id: 3, role: 'user', content: 'Help', timestamp: '2026-04-15T23:00:05Z' },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Sure!',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:06Z',
          latency_ms: 800,
        },
      ],
    };

    const result = monitorLatency(trajectory);
    expect(result.totalLatencyMs).toBe(2000);
    expect(result.avgLatencyMs).toBe(1000);
    expect(result.maxLatencyMs).toBe(1200);
    expect(result.minLatencyMs).toBe(800);
    expect(result.turnCount).toBe(2);
    expect(result.turns).toHaveLength(2);
  });

  it('should compute correct percentiles', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'percentile-test',
      turns: [
        { turn_id: 1, role: 'user', content: 'Hi', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'A',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          latency_ms: 100,
        },
        { turn_id: 3, role: 'user', content: 'B', timestamp: '2026-04-15T23:00:05Z' },
        {
          turn_id: 4,
          role: 'agent',
          content: 'C',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:06Z',
          latency_ms: 200,
        },
        { turn_id: 5, role: 'user', content: 'D', timestamp: '2026-04-15T23:00:10Z' },
        {
          turn_id: 6,
          role: 'agent',
          content: 'E',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:11Z',
          latency_ms: 300,
        },
        { turn_id: 7, role: 'user', content: 'F', timestamp: '2026-04-15T23:00:15Z' },
        {
          turn_id: 8,
          role: 'agent',
          content: 'G',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:16Z',
          latency_ms: 5000,
        },
      ],
    };

    const result = monitorLatency(trajectory);
    expect(result.p50Ms).toBeGreaterThan(0);
    expect(result.p90Ms).toBeGreaterThan(result.p50Ms);
    expect(result.p99Ms).toBeGreaterThanOrEqual(result.p90Ms);
    expect(result.maxLatencyMs).toBe(5000);
    expect(result.minLatencyMs).toBe(100);
  });

  it('should handle missing latency data', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'no-latency',
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

    const result = monitorLatency(trajectory);
    expect(result.totalLatencyMs).toBe(0);
    expect(result.avgLatencyMs).toBe(0);
    expect(result.turnCount).toBe(1);
  });

  it('should only count agent turns', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'agent-only',
      turns: [
        { turn_id: 1, role: 'user', content: 'A', timestamp: '2026-04-15T23:00:00Z' },
        {
          turn_id: 2,
          role: 'agent',
          content: 'B',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          latency_ms: 500,
        },
        { turn_id: 3, role: 'user', content: 'C', timestamp: '2026-04-15T23:00:05Z' },
        {
          turn_id: 4,
          role: 'agent',
          content: 'D',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:06Z',
          latency_ms: 600,
        },
        { turn_id: 5, role: 'user', content: 'E', timestamp: '2026-04-15T23:00:10Z' },
        {
          turn_id: 6,
          role: 'agent',
          content: 'F',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:11Z',
          latency_ms: 700,
        },
      ],
    };

    const result = monitorLatency(trajectory);
    expect(result.turnCount).toBe(3);
    expect(result.turns).toHaveLength(3);
    expect(result.turns.every((t) => t.latencyMs > 0)).toBe(true);
  });
});

describe('Gate Evaluation', () => {
  it('should pass when threshold gates are met', () => {
    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.92 },
    });

    const engine = new GateEngine([
      {
        name: 'quality',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      },
    ]);

    const summary = engine.evaluate(results);
    expect(summary.overallPassed).toBe(true);
    expect(summary.passedGates).toBe(1);
    expect(summary.failedGates).toBe(0);
    expect(summary.results[0]!.passed).toBe(true);
    expect(summary.results[0]!.actualValue).toBe(0.92);
  });

  it('should fail when thresholds are not met', () => {
    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.45 },
    });

    const engine = new GateEngine([
      {
        name: 'quality',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      },
    ]);

    const summary = engine.evaluate(results);
    expect(summary.overallPassed).toBe(false);
    expect(summary.failedGates).toBe(1);
    expect(summary.results[0]!.passed).toBe(false);
  });

  it('should evaluate custom gates', () => {
    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.5 },
    });

    const engine = new GateEngine([
      {
        name: 'custom-check',
        type: 'custom',
        customFn: (r): { passed: boolean; reason: string } => ({
          passed: r.overallMetrics.overallScore >= 0.5,
          reason: 'Score meets minimum',
        }),
      },
    ]);

    const summary = engine.evaluate(results);
    expect(summary.overallPassed).toBe(true);
    expect(summary.results[0]!.passed).toBe(true);
    expect(summary.results[0]!.reason).toBe('Score meets minimum');
  });

  it('should create engine via createGateEngine factory', () => {
    const engine = createGateEngine([
      {
        name: 'gate1',
        type: 'threshold' as const,
        metric: 'overall_score',
        operator: '>=' as const,
        threshold: 0.5,
      },
    ]);

    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.7 },
    });

    const summary = engine.evaluate(results);
    expect(summary.overallPassed).toBe(true);
    expect(summary.runId).toBe('test-run-1');
  });

  it('should handle multiple gates with mixed results', () => {
    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.9 },
      cost_score: { avgScore: 0.6 },
      latency_score: { avgScore: 0.3 },
    });

    const engine = new GateEngine([
      {
        name: 'quality',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      },
      { name: 'cost', type: 'threshold', metric: 'cost_score', operator: '>=', threshold: 0.7 },
      {
        name: 'latency',
        type: 'threshold',
        metric: 'latency_score',
        operator: '>=',
        threshold: 0.5,
      },
    ]);

    const summary = engine.evaluate(results);
    expect(summary.totalGates).toBe(3);
    expect(summary.passedGates).toBe(1);
    expect(summary.failedGates).toBe(2);
    expect(summary.overallPassed).toBe(false);
  });

  it('should support less-than-or-equal operator', () => {
    const results = makeAggregatedResults({
      cost_metric: { avgScore: 0.03 },
    });

    const engine = new GateEngine([
      {
        name: 'cost-limit',
        type: 'threshold',
        metric: 'cost_metric',
        operator: '<=',
        threshold: 0.05,
      },
    ]);

    const summary = engine.evaluate(results);
    expect(summary.overallPassed).toBe(true);
  });

  it('should skip disabled gates', () => {
    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.2 },
    });

    const engine = new GateEngine([
      {
        name: 'enabled-gate',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      },
      {
        name: 'disabled-gate',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.99,
        enabled: false,
      },
    ]);

    const summary = engine.evaluate(results);
    expect(summary.totalGates).toBe(1);
    expect(summary.overallPassed).toBe(false);
  });

  it('should report gate results with actual and expected values', () => {
    const results = makeAggregatedResults({
      overall_score: { avgScore: 0.75 },
    });

    const engine = new GateEngine([
      {
        name: 'quality',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      },
    ]);

    const summary = engine.evaluate(results);
    const gateResult = summary.results[0]!;
    expect(gateResult.actualValue).toBe(0.75);
    expect(gateResult.expectedValue).toBe(0.8);
    expect(gateResult.name).toBe('quality');
    expect(gateResult.type).toBe('threshold');
  });
});

describe('Full Pipeline Integration', () => {
  it('should track costs and latency alongside quality evaluation', () => {
    const trajectory: Trajectory = {
      trajectory_id: 'full-pipeline',
      turns: [
        {
          turn_id: 1,
          role: 'user',
          content: 'Create a user account for john@example.com',
          timestamp: '2026-04-15T23:00:00Z',
        },
        {
          turn_id: 2,
          role: 'agent',
          content: 'I will create the account now.',
          tool_calls: [],
          timestamp: '2026-04-15T23:00:01Z',
          latency_ms: 500,
          cost: { input_tokens: 200, output_tokens: 60 },
        },
        {
          turn_id: 3,
          role: 'user',
          content: 'Make him an admin too',
          timestamp: '2026-04-15T23:00:10Z',
        },
        {
          turn_id: 4,
          role: 'agent',
          content: 'Account created and admin privileges granted successfully!',
          tool_calls: [
            {
              name: 'create_user',
              arguments: { email: 'john@example.com' },
              result: { status: 'created', user_id: 'u-123' },
            },
            {
              name: 'set_role',
              arguments: { user_id: 'u-123', role: 'admin' },
              result: { status: 'updated' },
            },
          ],
          timestamp: '2026-04-15T23:00:11Z',
          latency_ms: 1500,
          cost: { input_tokens: 300, output_tokens: 80 },
        },
      ],
    };

    const evalResult = evaluate(trajectory);
    expect(evalResult.overall_score).toBeGreaterThan(0);
    expect(evalResult.passed).toBe(true);

    const costResult = calculateTrajectoryCost(trajectory, 'claude-sonnet');
    expect(costResult.total_cost).toBeGreaterThan(0);
    expect(costResult.per_turn).toHaveLength(2);
    expect(costResult.input_tokens).toBe(500);
    expect(costResult.output_tokens).toBe(140);

    const latencyResult = monitorLatency(trajectory);
    expect(latencyResult.totalLatencyMs).toBe(2000);
    expect(latencyResult.turnCount).toBe(2);
    expect(latencyResult.maxLatencyMs).toBe(1500);
    expect(latencyResult.minLatencyMs).toBe(500);

    for (const turn of trajectory.turns) {
      if (turn.role === 'agent' && turn.tool_calls) {
        for (const tc of turn.tool_calls) {
          const vr = validateToolCall(tc);
          expect(vr.valid).toBe(true);
        }
      }
    }

    const aggregated = makeAggregatedResults({
      overall_score: { avgScore: evalResult.overall_score },
      cost: { avgScore: 1 - costResult.total_cost },
      latency: { avgScore: 1 - latencyResult.avgLatencyMs / 10000 },
    });

    const engine = createGateEngine([
      {
        name: 'quality',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.5,
      },
      { name: 'cost-check', type: 'threshold', metric: 'cost', operator: '>=', threshold: 0.9 },
      {
        name: 'latency-check',
        type: 'threshold',
        metric: 'latency',
        operator: '>=',
        threshold: 0.5,
      },
    ]);

    const gateSummary = engine.evaluate(aggregated);
    expect(gateSummary.overallPassed).toBe(true);
    expect(gateSummary.runId).toBe('test-run-1');
  });
});
