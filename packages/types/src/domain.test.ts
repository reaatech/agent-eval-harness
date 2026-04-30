import { describe, expect, it } from 'vitest';
import type {
  CostBreakdown,
  CostData,
  EvalIssue,
  EvalResult,
  EvalRunStatus,
  EvalSuiteConfig,
  GateResult,
  GoldenTrajectory,
  JudgeScore,
  LatencyBudget,
  LatencyResult,
  LatencyViolation,
  MetricRegression,
  RegressionGate,
  RunComparison,
  ToolCall,
  Trajectory,
  Turn,
  TurnCost,
} from './domain.js';

describe('domain types', () => {
  describe('Turn', () => {
    it('should allow a valid user turn', () => {
      const turn: Turn = {
        turn_id: 1,
        role: 'user',
        content: 'Hello',
        timestamp: '2026-04-15T23:00:00Z',
      };
      expect(turn.turn_id).toBe(1);
      expect(turn.role).toBe('user');
      expect(turn.content).toBe('Hello');
    });

    it('should allow an agent turn with tool_calls', () => {
      const turn: Turn = {
        turn_id: 2,
        role: 'agent',
        content: 'Done',
        tool_calls: [
          {
            name: 'search',
            arguments: { q: 'test' },
            result: { ok: true },
          },
        ],
        timestamp: '2026-04-15T23:00:01Z',
      };
      expect(turn.role).toBe('agent');
      expect(turn.tool_calls).toHaveLength(1);
    });

    it('should allow optional golden markers', () => {
      const turn: Turn = {
        turn_id: 1,
        role: 'user',
        content: 'Hello',
        timestamp: '2026-04-15T23:00:00Z',
        golden: true,
        expected: true,
        quality_notes: 'Polite greeting',
      };
      expect(turn.golden).toBe(true);
      expect(turn.expected).toBe(true);
      expect(turn.quality_notes).toBe('Polite greeting');
    });

    it('should allow optional cost data', () => {
      const cost: CostData = {
        input_tokens: 100,
        output_tokens: 50,
        total_cost: 0.002,
      };
      const turn: Turn = {
        turn_id: 1,
        role: 'agent',
        content: 'Hi',
        timestamp: '2026-04-15T23:00:00Z',
        cost,
      };
      expect(turn.cost?.input_tokens).toBe(100);
      expect(turn.cost?.total_cost).toBe(0.002);
    });

    it('should allow optional latency_ms', () => {
      const turn: Turn = {
        turn_id: 1,
        role: 'agent',
        content: 'Fast',
        timestamp: '2026-04-15T23:00:00Z',
        latency_ms: 120,
      };
      expect(turn.latency_ms).toBe(120);
    });
  });

  describe('ToolCall', () => {
    it('should allow a tool call with result', () => {
      const tc: ToolCall = {
        name: 'send_email',
        arguments: { to: 'a@b.c', body: 'hi' },
        result: { status: 'sent' },
      };
      expect(tc.name).toBe('send_email');
      expect(tc.result).toEqual({ status: 'sent' });
    });

    it('should allow a tool call without result', () => {
      const tc: ToolCall = {
        name: 'search',
        arguments: { q: 'test' },
      };
      expect(tc.result).toBeUndefined();
    });
  });

  describe('Trajectory', () => {
    it('should allow a trajectory with turns and metadata', () => {
      const traj: Trajectory = {
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
        metadata: {
          agent_id: 'agent-1',
          session_id: 'sess-1',
          start_time: '2026-04-15T23:00:00Z',
          end_time: '2026-04-15T23:00:01Z',
          total_cost: 0.005,
          total_turns: 2,
        },
      };
      expect(traj.turns).toHaveLength(2);
      expect(traj.metadata?.total_turns).toBe(2);
    });
  });

  describe('EvalResult', () => {
    it('should allow a valid eval result', () => {
      const result: EvalResult = {
        trajectory_id: 'traj-1',
        overall_score: 0.85,
        metrics: {
          faithfulness: 0.9,
          relevance: 0.85,
          tool_correctness: 0.8,
        },
        issues: [
          {
            type: 'missing_tool_name',
            severity: 'high',
            description: 'Tool has no name',
            turn_id: 2,
          },
        ],
        passed: true,
        evaluated_at: '2026-04-15T23:00:10Z',
      };
      expect(result.overall_score).toBe(0.85);
      expect(result.passed).toBe(true);
    });

    it('should allow optional fields', () => {
      const result: EvalResult = {
        trajectory_id: 'traj-2',
        overall_score: 0.5,
        metrics: {},
      };
      expect(result.issues).toBeUndefined();
      expect(result.passed).toBeUndefined();
    });
  });

  describe('EvalIssue', () => {
    it('should support all severity levels', () => {
      const severities: EvalIssue['severity'][] = ['low', 'medium', 'high', 'critical'];
      for (const severity of severities) {
        const issue: EvalIssue = {
          type: 'test',
          severity,
          description: `A ${severity} issue`,
        };
        expect(issue.severity).toBe(severity);
      }
    });
  });

  describe('JudgeScore', () => {
    it('should allow a judge score with optional fields', () => {
      const score: JudgeScore = {
        score: 0.92,
        explanation: 'Response is faithful and relevant',
        confidence: 0.95,
        calibrated: true,
        model_used: 'claude-opus',
        cost: 0.01,
      };
      expect(score.score).toBe(0.92);
      expect(score.confidence).toBe(0.95);
    });
  });

  describe('CostBreakdown', () => {
    it('should allow full cost breakdown', () => {
      const breakdown: CostBreakdown = {
        trajectory_id: 'traj-1',
        total_cost: 0.025,
        llm_cost: 0.02,
        tool_cost: 0.005,
        breakdown: {
          llm_calls: 4,
          tool_invocations: 2,
          judge_evaluations: 3,
        },
        per_turn: [
          {
            turn_id: 1,
            cost: 0.01,
            tokens: { input: 150, output: 45 },
          },
        ],
      };
      expect(breakdown.breakdown?.llm_calls).toBe(4);
    });
  });

  describe('TurnCost', () => {
    it('should allow turn cost with token breakdown', () => {
      const tc: TurnCost = {
        turn_id: 1,
        cost: 0.005,
        tokens: { input: 100, output: 30 },
      };
      expect(tc.tokens?.input).toBe(100);
    });
  });

  describe('LatencyBudget', () => {
    it('should allow latency budget config', () => {
      const budget: LatencyBudget = {
        per_turn_p50: 1000,
        per_turn_p99: 5000,
        trajectory_total: 30000,
        components: {
          llm_call: 800,
          tool_invocation: 200,
          total_overhead: 100,
        },
      };
      expect(budget.per_turn_p99).toBe(5000);
    });
  });

  describe('LatencyResult', () => {
    it('should allow latency result with violations', () => {
      const violation: LatencyViolation = {
        turn_id: 2,
        actual_ms: 6000,
        threshold_ms: 5000,
        metric: 'p99',
      };
      const result: LatencyResult = {
        trajectory_id: 'traj-1',
        p50_ms: 500,
        p90_ms: 2000,
        p99_ms: 6000,
        total_ms: 8000,
        violations: [violation],
        within_sla: false,
      };
      expect(result.within_sla).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });

  describe('GoldenTrajectory', () => {
    it('should allow a golden trajectory', () => {
      const golden: GoldenTrajectory = {
        id: 'golden-1',
        name: 'password-reset',
        description: 'Standard password reset flow',
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
              content: 'Password reset sent!',
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
      };
      expect(golden.name).toBe('password-reset');
      expect(golden.quality_markers.overall).toBe(0.9);
    });
  });

  describe('RegressionGate', () => {
    it('should support all gate types and operators', () => {
      const gate: RegressionGate = {
        name: 'overall-quality',
        type: 'threshold',
        metric: 'overall_score',
        operator: '>=',
        threshold: 0.8,
      };
      expect(gate.type).toBe('threshold');
      expect(gate.operator).toBe('>=');
    });
  });

  describe('GateResult', () => {
    it('should allow a gate result', () => {
      const result: GateResult = {
        gate_name: 'overall-quality',
        passed: true,
        actual_value: 0.87,
        expected_value: 0.8,
        message: 'Overall quality gate passed',
      };
      expect(result.passed).toBe(true);
    });
  });

  describe('EvalSuiteConfig', () => {
    it('should allow suite config', () => {
      const config: EvalSuiteConfig = {
        metrics: ['faithfulness', 'relevance', 'latency'],
        judge_model: 'claude-opus',
        budget_limit: 10.0,
        parallel_workers: 4,
      };
      expect(config.metrics).toHaveLength(3);
    });
  });

  describe('EvalRunStatus', () => {
    it('should allow run status', () => {
      const status: EvalRunStatus = {
        run_id: 'eval-123',
        status: 'running',
        progress: 50,
        total_trajectories: 10,
        evaluated_trajectories: 5,
        started_at: '2026-04-15T23:00:00Z',
      };
      expect(status.progress).toBe(50);
    });
  });

  describe('MetricRegression', () => {
    it('should allow a metric regression', () => {
      const reg: MetricRegression = {
        metric: 'faithfulness',
        baseline_value: 0.9,
        candidate_value: 0.85,
        change: -0.05,
        change_percent: -5.56,
      };
      expect(reg.change).toBe(-0.05);
    });
  });

  describe('RunComparison', () => {
    it('should allow a run comparison with statistical significance', () => {
      const comparison: RunComparison = {
        baseline_run_id: 'eval-100',
        candidate_run_id: 'eval-200',
        metrics_diff: { faithfulness: -0.02, relevance: 0.01 },
        regressions: [
          {
            metric: 'faithfulness',
            baseline_value: 0.9,
            candidate_value: 0.88,
            change: -0.02,
            change_percent: -2.22,
          },
        ],
        improvements: [
          {
            metric: 'relevance',
            baseline_value: 0.85,
            candidate_value: 0.86,
            change: 0.01,
            change_percent: 1.18,
          },
        ],
        statistical_significance: [{ metric: 'faithfulness', p_value: 0.03, significant: true }],
      };
      expect(comparison.statistical_significance).toHaveLength(1);
    });
  });
});
