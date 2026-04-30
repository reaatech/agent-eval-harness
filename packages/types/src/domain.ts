/**
 * Core domain types for agent-eval-harness
 */

/** A single turn in a trajectory */
export interface Turn {
  turn_id: number;
  role: 'user' | 'agent';
  content: string;
  timestamp: string; // ISO-8601
  tool_calls?: ToolCall[];
  latency_ms?: number;
  cost?: CostData;
  // Golden trajectory markers
  golden?: boolean;
  expected?: boolean;
  quality_notes?: string;
}

/** A tool invocation with arguments and result */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/** Cost data for a turn */
export interface CostData {
  input_tokens: number;
  output_tokens: number;
  total_cost?: number;
}

/** Complete agent execution trajectory */
export interface Trajectory {
  trajectory_id?: string;
  turns: Turn[];
  metadata?: {
    agent_id?: string;
    session_id?: string;
    start_time?: string;
    end_time?: string;
    total_cost?: number;
    total_turns?: number;
  };
}

/** Evaluation result for a trajectory */
export interface EvalResult {
  trajectory_id: string;
  overall_score: number;
  metrics: {
    faithfulness?: number;
    relevance?: number;
    tool_correctness?: number;
    cost_score?: number;
    latency_score?: number;
    coherence?: number;
    goal_completion?: number;
  };
  issues?: EvalIssue[];
  passed?: boolean;
  evaluated_at?: string;
  timestamp?: string;
  file?: string;
  quality?: number;
  cost?: number;
  error?: string;
}

/** An issue found during evaluation */
export interface EvalIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  turn_id?: number;
  tool_name?: string;
}

/** LLM judge scoring result */
export interface JudgeScore {
  score: number; // 0.0 to 1.0
  explanation: string;
  confidence?: number;
  calibrated?: boolean;
  model_used?: string;
  cost?: number;
}

/** Cost breakdown for evaluation */
export interface CostBreakdown {
  trajectory_id?: string;
  total_cost: number;
  llm_cost?: number;
  tool_cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  breakdown?: {
    llm_calls: number;
    tool_invocations?: number;
    judge_evaluations?: number;
  };
  per_turn?: TurnCost[];
}

/** Cost per turn */
export interface TurnCost {
  turn_id: number;
  cost: number;
  llm_cost?: number;
  tool_cost?: number;
  total_cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  tokens?: {
    input: number;
    output: number;
  };
}

/** Latency budget configuration */
export interface LatencyBudget {
  per_turn_p50?: number;
  per_turn_p90?: number;
  per_turn_p99?: number;
  trajectory_total?: number;
  components?: {
    llm_call?: number;
    tool_invocation?: number;
    total_overhead?: number;
  };
}

/** Latency measurement result */
export interface LatencyResult {
  trajectory_id: string;
  p50_ms: number;
  p90_ms: number;
  p99_ms: number;
  total_ms: number;
  violations: LatencyViolation[];
  within_sla: boolean;
}

/** A latency SLA violation */
export interface LatencyViolation {
  turn_id: number;
  actual_ms: number;
  threshold_ms: number;
  metric: string;
}

/** Golden trajectory for regression comparison */
export interface GoldenTrajectory {
  id: string;
  name: string;
  description?: string;
  trajectory: Trajectory;
  version: string;
  created_at: string;
  updated_at: string;
  quality_markers: {
    faithfulness: number;
    relevance: number;
    tool_correctness: number;
    overall: number;
  };
}

/** Regression gate definition */
export interface RegressionGate {
  name: string;
  type: 'threshold' | 'baseline-comparison' | 'distribution';
  metric: string;
  operator: '>=' | '<=' | '==' | '!=' | '>' | '<';
  threshold?: number;
  baseline?: string;
  allow_regression?: boolean;
}

/** Gate evaluation result */
export interface GateResult {
  gate_name: string;
  passed: boolean;
  actual_value: number;
  expected_value?: number;
  message: string;
}

/** Evaluation suite configuration */
export interface EvalSuiteConfig {
  metrics: string[];
  judge_model?: string;
  budget_limit?: number;
  latency_budget?: LatencyBudget;
  golden_trajectories?: string[];
  gates?: RegressionGate[];
  parallel_workers?: number;
}

/** Evaluation suite run status */
export interface EvalRunStatus {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total_trajectories: number;
  evaluated_trajectories: number;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

/** Comparison result between two eval runs */
export interface RunComparison {
  baseline_run_id: string;
  candidate_run_id: string;
  metrics_diff: Record<string, number>;
  regressions: MetricRegression[];
  improvements: MetricRegression[];
  statistical_significance?: {
    metric: string;
    p_value: number;
    significant: boolean;
  }[];
}

/** A metric regression detected */
export interface MetricRegression {
  metric: string;
  baseline_value: number;
  candidate_value: number;
  change: number;
  change_percent: number;
}
