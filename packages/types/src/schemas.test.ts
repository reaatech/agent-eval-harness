import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  CostBreakdownSchema,
  CostDataSchema,
  EvalIssueSchema,
  EvalResultSchema,
  EvalRunStatusSchema,
  EvalSuiteConfigSchema,
  GateResultSchema,
  GoldenTrajectorySchema,
  JudgeScoreSchema,
  LatencyBudgetSchema,
  LatencyResultSchema,
  LatencyViolationSchema,
  MetricRegressionSchema,
  QualityMarkersSchema,
  RegressionGateSchema,
  RunComparisonSchema,
  ToolCallSchema,
  TrajectoryMetadataSchema,
  TrajectorySchema,
  TurnSchema,
} from './schemas.js';

describe('ToolCallSchema', () => {
  it('should parse a valid tool call', () => {
    const result = ToolCallSchema.parse({
      name: 'search',
      arguments: { q: 'test' },
      result: { found: true },
    });
    expect(result.name).toBe('search');
    expect(result.result).toEqual({ found: true });
  });

  it('should parse a tool call without result', () => {
    const result = ToolCallSchema.parse({
      name: 'delete',
      arguments: { id: '123' },
    });
    expect(result.name).toBe('delete');
    expect(result.result).toBeUndefined();
  });

  it('should reject empty tool name', () => {
    expect(() => ToolCallSchema.parse({ name: '', arguments: {} })).toThrow();
  });
});

describe('CostDataSchema', () => {
  it('should parse valid cost data', () => {
    const result = CostDataSchema.parse({
      input_tokens: 100,
      output_tokens: 50,
      total_cost: 0.002,
    });
    expect(result.input_tokens).toBe(100);
    expect(result.total_cost).toBe(0.002);
  });

  it('should reject negative token counts', () => {
    expect(() => CostDataSchema.parse({ input_tokens: -1, output_tokens: 5 })).toThrow();
  });
});

describe('TurnSchema', () => {
  it('should parse a valid user turn', () => {
    const result = TurnSchema.parse({
      turn_id: 1,
      role: 'user',
      content: 'Hello',
      timestamp: '2026-04-15T23:00:00Z',
    });
    expect(result.turn_id).toBe(1);
    expect(result.role).toBe('user');
  });

  it('should parse a valid agent turn with tool_calls', () => {
    const result = TurnSchema.parse({
      turn_id: 2,
      role: 'agent',
      content: 'Done',
      tool_calls: [{ name: 'search', arguments: { q: 'test' }, result: { ok: true } }],
      timestamp: '2026-04-15T23:00:01Z',
    });
    expect(result.tool_calls).toHaveLength(1);
  });

  it('should parse a turn with optional golden markers', () => {
    const result = TurnSchema.parse({
      turn_id: 1,
      role: 'user',
      content: 'Hello',
      timestamp: '2026-04-15T23:00:00Z',
      golden: true,
      expected: true,
      quality_notes: 'Polite greeting',
    });
    expect(result.golden).toBe(true);
  });

  it('should reject invalid role', () => {
    expect(() =>
      TurnSchema.parse({
        turn_id: 1,
        role: 'system',
        content: 'hi',
        timestamp: '2026-04-15T23:00:00Z',
      }),
    ).toThrow();
  });

  it('should reject non-positive turn_id', () => {
    expect(() =>
      TurnSchema.parse({
        turn_id: 0,
        role: 'user',
        content: 'hi',
        timestamp: '2026-04-15T23:00:00Z',
      }),
    ).toThrow();
  });

  it('should reject invalid timestamp format', () => {
    expect(() =>
      TurnSchema.parse({
        turn_id: 1,
        role: 'user',
        content: 'hi',
        timestamp: 'not-a-date',
      }),
    ).toThrow();
  });

  it('should parse turn with optional latency_ms', () => {
    const result = TurnSchema.parse({
      turn_id: 5,
      role: 'agent',
      content: 'fast',
      tool_calls: [],
      timestamp: '2026-04-15T23:00:00Z',
      latency_ms: 120,
    });
    expect(result.latency_ms).toBe(120);
  });

  it('should parse turn with optional cost', () => {
    const result = TurnSchema.parse({
      turn_id: 6,
      role: 'agent',
      content: 'costly',
      tool_calls: [],
      timestamp: '2026-04-15T23:00:00Z',
      cost: { input_tokens: 100, output_tokens: 50, total_cost: 0.002 },
    });
    expect(result.cost?.input_tokens).toBe(100);
    expect(result.cost?.total_cost).toBe(0.002);
  });
});

describe('TrajectorySchema', () => {
  it('should parse a valid trajectory', () => {
    const result = TrajectorySchema.parse({
      trajectory_id: 'traj-1',
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
    });
    expect(result.turns).toHaveLength(2);
  });

  it('should parse a trajectory with metadata', () => {
    const result = TrajectorySchema.parse({
      trajectory_id: 'traj-2',
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
      metadata: {
        agent_id: 'agent-1',
        total_turns: 2,
        start_time: '2026-04-15T23:00:00Z',
        end_time: '2026-04-15T23:00:01Z',
      },
    });
    expect(result.metadata?.agent_id).toBe('agent-1');
  });

  it('should reject trajectory with no turns', () => {
    expect(() => TrajectorySchema.parse({ turns: [] })).toThrow();
  });

  it('should infer TurnSchema type', () => {
    type TurnT = z.infer<typeof TurnSchema>;
    const turn: TurnT = {
      turn_id: 1,
      role: 'user',
      content: 'hi',
      timestamp: '2026-04-15T23:00:00Z',
    };
    expect(turn.turn_id).toBe(1);
  });
});

describe('TrajectoryMetadataSchema', () => {
  it('should parse full metadata', () => {
    const result = TrajectoryMetadataSchema.parse({
      agent_id: 'agent-1',
      session_id: 'sess-1',
      start_time: '2026-04-15T23:00:00Z',
      end_time: '2026-04-15T23:00:01Z',
      total_cost: 0.005,
      total_turns: 2,
    });
    expect(result.agent_id).toBe('agent-1');
    expect(result.total_turns).toBe(2);
  });

  it('should reject negative total_turns', () => {
    expect(() => TrajectoryMetadataSchema.parse({ total_turns: -1 })).toThrow();
  });
});

describe('EvalIssueSchema', () => {
  it('should parse a valid eval issue', () => {
    const result = EvalIssueSchema.parse({
      type: 'missing_tool_name',
      severity: 'high',
      description: 'Tool has no name',
      turn_id: 2,
    });
    expect(result.severity).toBe('high');
  });

  it('should reject invalid severity', () => {
    expect(() =>
      EvalIssueSchema.parse({
        type: 'test',
        severity: 'unknown',
        description: 'bad',
      }),
    ).toThrow();
  });
});

describe('EvalResultSchema', () => {
  it('should parse a valid eval result', () => {
    const result = EvalResultSchema.parse({
      trajectory_id: 'traj-1',
      overall_score: 0.85,
      metrics: {
        faithfulness: 0.9,
        relevance: 0.85,
      },
      passed: true,
      evaluated_at: '2026-04-15T23:00:10Z',
    });
    expect(result.overall_score).toBe(0.85);
  });

  it('should reject score > 1', () => {
    expect(() =>
      EvalResultSchema.parse({
        trajectory_id: 'traj-1',
        overall_score: 1.5,
        metrics: {},
      }),
    ).toThrow();
  });

  it('should reject negative score', () => {
    expect(() =>
      EvalResultSchema.parse({
        trajectory_id: 'traj-1',
        overall_score: -0.1,
        metrics: {},
      }),
    ).toThrow();
  });

  it('should parse result with issues', () => {
    const result = EvalResultSchema.parse({
      trajectory_id: 'traj-1',
      overall_score: 0.7,
      metrics: {},
      issues: [{ type: 'hallucination', severity: 'critical', description: 'Made up data' }],
    });
    expect(result.issues).toHaveLength(1);
  });
});

describe('JudgeScoreSchema', () => {
  it('should parse a judge score', () => {
    const result = JudgeScoreSchema.parse({
      score: 0.92,
      explanation: 'Response is faithful',
      confidence: 0.95,
      calibrated: true,
      model_used: 'claude-opus',
    });
    expect(result.confidence).toBe(0.95);
  });

  it('should reject confidence > 1', () => {
    expect(() =>
      JudgeScoreSchema.parse({
        score: 0.5,
        explanation: 'test',
        confidence: 1.2,
      }),
    ).toThrow();
  });
});

describe('CostBreakdownSchema', () => {
  it('should parse a full cost breakdown with per_turn', () => {
    const result = CostBreakdownSchema.parse({
      total_cost: 0.05,
      breakdown: { llm_calls: 5, tool_invocations: 3 },
      per_turn: [
        { turn_id: 1, cost: 0.02 },
        { turn_id: 2, cost: 0.03, tokens: { input: 100, output: 50 } },
      ],
    });
    expect(result.per_turn).toHaveLength(2);
  });

  it('should parse minimal cost breakdown', () => {
    const result = CostBreakdownSchema.parse({
      total_cost: 0.01,
    });
    expect(result.total_cost).toBe(0.01);
    expect(result.breakdown).toBeUndefined();
  });
});

describe('LatencyBudgetSchema', () => {
  it('should parse a full latency budget', () => {
    const result = LatencyBudgetSchema.parse({
      per_turn_p50: 500,
      per_turn_p99: 5000,
      trajectory_total: 30000,
      components: {
        llm_call: 800,
        tool_invocation: 200,
      },
    });
    expect(result.per_turn_p99).toBe(5000);
  });

  it('should reject negative budget values', () => {
    expect(() => LatencyBudgetSchema.parse({ per_turn_p50: -100 })).toThrow();
  });
});

describe('LatencyViolationSchema', () => {
  it('should parse a valid latency violation', () => {
    const result = LatencyViolationSchema.parse({
      turn_id: 2,
      actual_ms: 6000,
      threshold_ms: 5000,
      metric: 'p99',
    });
    expect(result.actual_ms).toBe(6000);
  });
});

describe('LatencyResultSchema', () => {
  it('should parse a valid latency result', () => {
    const result = LatencyResultSchema.parse({
      trajectory_id: 'traj-1',
      p50_ms: 500,
      p90_ms: 2000,
      p99_ms: 6000,
      total_ms: 8000,
      violations: [],
      within_sla: false,
    });
    expect(result.within_sla).toBe(false);
  });
});

describe('QualityMarkersSchema', () => {
  it('should parse valid quality markers', () => {
    const result = QualityMarkersSchema.parse({
      faithfulness: 0.95,
      relevance: 0.9,
      tool_correctness: 0.85,
      overall: 0.9,
    });
    expect(result.overall).toBe(0.9);
  });

  it('should reject score > 1', () => {
    expect(() =>
      QualityMarkersSchema.parse({
        faithfulness: 1.5,
        relevance: 0.9,
        tool_correctness: 0.85,
        overall: 0.9,
      }),
    ).toThrow();
  });
});

describe('GoldenTrajectorySchema', () => {
  it('should parse a valid golden trajectory', () => {
    const result = GoldenTrajectorySchema.parse({
      id: 'golden-1',
      name: 'password-reset',
      trajectory: {
        turns: [
          {
            turn_id: 1,
            role: 'user',
            content: 'Reset my password',
            timestamp: '2026-04-15T23:00:00Z',
          },
          {
            turn_id: 2,
            role: 'agent',
            content: 'Done',
            tool_calls: [],
            timestamp: '2026-04-15T23:00:01Z',
          },
        ],
      },
      version: '1.0.0',
      created_at: '2026-04-15T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
      quality_markers: {
        faithfulness: 0.95,
        relevance: 0.9,
        tool_correctness: 0.85,
        overall: 0.9,
      },
    });
    expect(result.name).toBe('password-reset');
  });
});

describe('RegressionGateSchema', () => {
  it('should parse all gate types', () => {
    const result = RegressionGateSchema.parse({
      name: 'overall-quality',
      type: 'threshold',
      metric: 'overall_score',
      operator: '>=',
      threshold: 0.8,
    });
    expect(result.type).toBe('threshold');
  });

  it('should parse baseline-comparison type', () => {
    const result = RegressionGateSchema.parse({
      name: 'no-regression',
      type: 'baseline-comparison',
      metric: 'overall_score',
      operator: '>=',
      baseline: 'results/baseline.json',
      allow_regression: false,
    });
    expect(result.type).toBe('baseline-comparison');
  });
});

describe('GateResultSchema', () => {
  it('should parse a passed gate result', () => {
    const result = GateResultSchema.parse({
      gate_name: 'overall-quality',
      passed: true,
      actual_value: 0.87,
      expected_value: 0.8,
      message: 'Gate passed',
    });
    expect(result.passed).toBe(true);
  });
});

describe('EvalSuiteConfigSchema', () => {
  it('should parse suite config with all options', () => {
    const result = EvalSuiteConfigSchema.parse({
      metrics: ['faithfulness', 'relevance', 'latency'],
      judge_model: 'claude-opus',
      budget_limit: 10.0,
      latency_budget: { per_turn_p99: 5000 },
      golden_trajectories: ['golden/ref.jsonl'],
      gates: [
        {
          name: 'quality',
          type: 'threshold',
          metric: 'overall_score',
          operator: '>=',
          threshold: 0.8,
        },
      ],
      parallel_workers: 4,
    });
    expect(result.judge_model).toBe('claude-opus');
    expect(result.gates).toHaveLength(1);
  });
});

describe('EvalRunStatusSchema', () => {
  it('should parse running status', () => {
    const result = EvalRunStatusSchema.parse({
      run_id: 'eval-123',
      status: 'running',
      progress: 50,
      total_trajectories: 10,
      evaluated_trajectories: 5,
    });
    expect(result.progress).toBe(50);
  });

  it('should reject progress > 100', () => {
    expect(() =>
      EvalRunStatusSchema.parse({
        run_id: 'eval-123',
        status: 'running',
        progress: 150,
        total_trajectories: 10,
        evaluated_trajectories: 5,
      }),
    ).toThrow();
  });
});

describe('MetricRegressionSchema', () => {
  it('should parse a metric regression', () => {
    const result = MetricRegressionSchema.parse({
      metric: 'faithfulness',
      baseline_value: 0.9,
      candidate_value: 0.85,
      change: -0.05,
      change_percent: -5.56,
    });
    expect(result.change).toBe(-0.05);
  });
});

describe('RunComparisonSchema', () => {
  it('should parse a run comparison', () => {
    const result = RunComparisonSchema.parse({
      baseline_run_id: 'eval-100',
      candidate_run_id: 'eval-200',
      metrics_diff: { faithfulness: -0.02 },
      regressions: [
        {
          metric: 'faithfulness',
          baseline_value: 0.9,
          candidate_value: 0.88,
          change: -0.02,
          change_percent: -2.22,
        },
      ],
      improvements: [],
      statistical_significance: [{ metric: 'faithfulness', p_value: 0.03, significant: true }],
    });
    expect(result.statistical_significance).toHaveLength(1);
  });
});
