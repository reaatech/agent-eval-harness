import { z } from 'zod';

/** Schema for tool call validation */
export const ToolCallSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  arguments: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for cost data validation */
export const CostDataSchema = z.object({
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  total_cost: z.number().optional(),
});

/** Schema for turn validation */
export const TurnSchema = z.object({
  turn_id: z.number().int().positive(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  timestamp: z.string().datetime(),
  tool_calls: z.array(ToolCallSchema).optional(),
  latency_ms: z.number().positive().optional(),
  cost: CostDataSchema.optional(),
  golden: z.boolean().optional(),
  expected: z.boolean().optional(),
  quality_notes: z.string().optional(),
});

/** Schema for trajectory metadata */
export const TrajectoryMetadataSchema = z.object({
  agent_id: z.string().optional(),
  session_id: z.string().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  total_cost: z.number().optional(),
  total_turns: z.number().int().nonnegative().optional(),
});

/** Schema for trajectory validation */
export const TrajectorySchema = z.object({
  trajectory_id: z.string().optional(),
  turns: z.array(TurnSchema).min(1, 'Trajectory must have at least one turn'),
  metadata: TrajectoryMetadataSchema.optional(),
});

/** Schema for evaluation issue */
export const EvalIssueSchema = z.object({
  type: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  turn_id: z.number().optional(),
  tool_name: z.string().optional(),
});

/** Schema for evaluation result */
export const EvalResultSchema = z.object({
  trajectory_id: z.string(),
  overall_score: z.number().min(0).max(1),
  metrics: z.object({
    faithfulness: z.number().min(0).max(1).optional(),
    relevance: z.number().min(0).max(1).optional(),
    tool_correctness: z.number().min(0).max(1).optional(),
    cost_score: z.number().min(0).max(1).optional(),
    latency_score: z.number().min(0).max(1).optional(),
    coherence: z.number().min(0).max(1).optional(),
    goal_completion: z.number().min(0).max(1).optional(),
  }),
  issues: z.array(EvalIssueSchema).optional(),
  passed: z.boolean().optional(),
  evaluated_at: z.string().datetime().optional(),
  timestamp: z.string().optional(),
  file: z.string().optional(),
  quality: z.number().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
});

/** Schema for judge score */
export const JudgeScoreSchema = z.object({
  score: z.number().min(0).max(1),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  calibrated: z.boolean().optional(),
  model_used: z.string().optional(),
  cost: z.number().optional(),
});

/** Schema for cost breakdown */
export const CostBreakdownSchema = z.object({
  trajectory_id: z.string().optional(),
  total_cost: z.number(),
  llm_cost: z.number().optional(),
  tool_cost: z.number().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  breakdown: z
    .object({
      llm_calls: z.number(),
      tool_invocations: z.number().optional(),
      judge_evaluations: z.number().optional(),
    })
    .optional(),
  per_turn: z
    .array(
      z.object({
        turn_id: z.number(),
        cost: z.number(),
        llm_cost: z.number().optional(),
        tool_cost: z.number().optional(),
        total_cost: z.number().optional(),
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
        tokens: z
          .object({
            input: z.number(),
            output: z.number(),
          })
          .optional(),
      }),
    )
    .optional(),
});

/** Schema for latency budget */
export const LatencyBudgetSchema = z.object({
  per_turn_p50: z.number().positive().optional(),
  per_turn_p90: z.number().positive().optional(),
  per_turn_p99: z.number().positive().optional(),
  trajectory_total: z.number().positive().optional(),
  components: z
    .object({
      llm_call: z.number().positive().optional(),
      tool_invocation: z.number().positive().optional(),
      total_overhead: z.number().positive().optional(),
    })
    .optional(),
});

/** Schema for latency violation */
export const LatencyViolationSchema = z.object({
  turn_id: z.number(),
  actual_ms: z.number().positive(),
  threshold_ms: z.number().positive(),
  metric: z.string(),
});

/** Schema for latency result */
export const LatencyResultSchema = z.object({
  trajectory_id: z.string(),
  p50_ms: z.number().positive(),
  p90_ms: z.number().positive(),
  p99_ms: z.number().positive(),
  total_ms: z.number().positive(),
  violations: z.array(LatencyViolationSchema),
  within_sla: z.boolean(),
});

/** Schema for golden trajectory quality markers */
export const QualityMarkersSchema = z.object({
  faithfulness: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  tool_correctness: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
});

/** Schema for golden trajectory */
export const GoldenTrajectorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  trajectory: TrajectorySchema,
  version: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  quality_markers: QualityMarkersSchema,
});

/** Schema for regression gate */
export const RegressionGateSchema = z.object({
  name: z.string(),
  type: z.enum(['threshold', 'baseline-comparison', 'distribution']),
  metric: z.string(),
  operator: z.enum(['>=', '<=', '==', '!=', '>', '<']),
  threshold: z.number().optional(),
  baseline: z.string().optional(),
  allow_regression: z.boolean().optional(),
});

/** Schema for gate result */
export const GateResultSchema = z.object({
  gate_name: z.string(),
  passed: z.boolean(),
  actual_value: z.number(),
  expected_value: z.number().optional(),
  message: z.string(),
});

/** Schema for evaluation suite configuration */
export const EvalSuiteConfigSchema = z.object({
  metrics: z.array(z.string()),
  judge_model: z.string().optional(),
  budget_limit: z.number().positive().optional(),
  latency_budget: LatencyBudgetSchema.optional(),
  golden_trajectories: z.array(z.string()).optional(),
  gates: z.array(RegressionGateSchema).optional(),
  parallel_workers: z.number().int().positive().optional(),
});

/** Schema for eval run status */
export const EvalRunStatusSchema = z.object({
  run_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  total_trajectories: z.number().int().positive(),
  evaluated_trajectories: z.number().int().nonnegative(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  error: z.string().optional(),
});

/** Schema for metric regression */
export const MetricRegressionSchema = z.object({
  metric: z.string(),
  baseline_value: z.number(),
  candidate_value: z.number(),
  change: z.number(),
  change_percent: z.number(),
});

/** Schema for run comparison */
export const RunComparisonSchema = z.object({
  baseline_run_id: z.string(),
  candidate_run_id: z.string(),
  metrics_diff: z.record(z.string(), z.number()),
  regressions: z.array(MetricRegressionSchema),
  improvements: z.array(MetricRegressionSchema),
  statistical_significance: z
    .array(
      z.object({
        metric: z.string(),
        p_value: z.number(),
        significant: z.boolean(),
      }),
    )
    .optional(),
});
