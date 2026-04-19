import type { Trajectory } from '../types/domain.js';

/**
 * Latency measurement for a single turn
 */
export interface TurnLatency {
  turnId: number;
  latencyMs: number;
  llmCallMs?: number;
  toolInvocationMs?: number;
  overheadMs?: number;
  timestamp: string;
}

/**
 * Latency monitoring result
 */
export interface LatencyResult {
  /** Per-turn latency measurements */
  turns: TurnLatency[];
  /** Total trajectory latency */
  totalLatencyMs: number;
  /** Average latency per turn */
  avgLatencyMs: number;
  /** P50 latency */
  p50Ms: number;
  /** P90 latency */
  p90Ms: number;
  /** P99 latency */
  p99Ms: number;
  /** Maximum latency */
  maxLatencyMs: number;
  /** Minimum latency */
  minLatencyMs: number;
  /** Number of turns analyzed */
  turnCount: number;
}

/**
 * Component latency breakdown
 */
export interface ComponentBreakdown {
  avgLlmCallMs: number;
  avgToolInvocationMs: number;
  avgOverheadMs: number;
  totalLlmCallMs: number;
  totalToolInvocationMs: number;
  totalOverheadMs: number;
}

/**
 * Monitor latency for a trajectory
 */
export function monitorLatency(trajectory: Trajectory): LatencyResult {
  const agentTurns = trajectory.turns.filter((t) => t.role === 'agent');
  const turns: TurnLatency[] = [];

  for (const turn of agentTurns) {
    const latencyMs = turn.latency_ms || 0;
    const bd = (turn as unknown as Record<string, unknown>).latency_breakdown as
      | { llm_call?: number; tool_invocation?: number }
      | undefined;
    const llmCallMs = bd?.llm_call;
    const toolInvocationMs = bd?.tool_invocation;
    const overheadMs =
      llmCallMs != null || toolInvocationMs != null
        ? Math.max(0, latencyMs - (llmCallMs ?? 0) - (toolInvocationMs ?? 0))
        : latencyMs;

    turns.push({
      turnId: turn.turn_id,
      latencyMs,
      ...(llmCallMs != null ? { llmCallMs } : {}),
      ...(toolInvocationMs != null ? { toolInvocationMs } : {}),
      overheadMs: Math.max(0, overheadMs),
      timestamp: turn.timestamp,
    });
  }

  const latencies = turns.map((t) => t.latencyMs).sort((a, b) => a - b);
  const totalLatencyMs = latencies.reduce((sum, l) => sum + l, 0);

  return {
    turns,
    totalLatencyMs: Math.round(totalLatencyMs * 100) / 100,
    avgLatencyMs: turns.length > 0 ? Math.round((totalLatencyMs / turns.length) * 100) / 100 : 0,
    p50Ms: percentile(latencies, 50),
    p90Ms: percentile(latencies, 90),
    p99Ms: percentile(latencies, 99),
    maxLatencyMs: latencies.length > 0 ? (latencies[latencies.length - 1] ?? 0) : 0,
    minLatencyMs: latencies.length > 0 ? (latencies[0] ?? 0) : 0,
    turnCount: turns.length,
  };
}

/**
 * Get component breakdown
 */
export function getComponentBreakdown(result: LatencyResult): ComponentBreakdown {
  const turnCount = result.turns.length || 1;

  const totalLlmCallMs = result.turns.reduce((sum, t) => sum + (t.llmCallMs || 0), 0);
  const totalToolInvocationMs = result.turns.reduce((sum, t) => sum + (t.toolInvocationMs || 0), 0);
  const totalOverheadMs = result.turns.reduce((sum, t) => sum + (t.overheadMs || 0), 0);

  return {
    avgLlmCallMs: Math.round((totalLlmCallMs / turnCount) * 100) / 100,
    avgToolInvocationMs: Math.round((totalToolInvocationMs / turnCount) * 100) / 100,
    avgOverheadMs: Math.round((totalOverheadMs / turnCount) * 100) / 100,
    totalLlmCallMs: Math.round(totalLlmCallMs * 100) / 100,
    totalToolInvocationMs: Math.round(totalToolInvocationMs * 100) / 100,
    totalOverheadMs: Math.round(totalOverheadMs * 100) / 100,
  };
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) {
    return Math.round((sortedValues[lower] ?? 0) * 100) / 100;
  }

  return (
    Math.round(
      ((sortedValues[lower] ?? 0) * (1 - fraction) + (sortedValues[upper] ?? 0) * fraction) * 100,
    ) / 100
  );
}

/**
 * Compare latency between two trajectories
 */
export function compareLatency(
  baseline: LatencyResult,
  candidate: LatencyResult,
): {
  avgDiffMs: number;
  p99DiffMs: number;
  faster: boolean;
  percentageChange: number;
} {
  const avgDiffMs = candidate.avgLatencyMs - baseline.avgLatencyMs;
  const p99DiffMs = candidate.p99Ms - baseline.p99Ms;
  const percentageChange =
    baseline.avgLatencyMs > 0 ? (avgDiffMs / baseline.avgLatencyMs) * 100 : avgDiffMs > 0 ? 100 : 0;

  return {
    avgDiffMs: Math.round(avgDiffMs * 100) / 100,
    p99DiffMs: Math.round(p99DiffMs * 100) / 100,
    faster: avgDiffMs < 0,
    percentageChange: Math.round(percentageChange * 100) / 100,
  };
}

/**
 * Detect latency anomalies
 */
export function detectAnomalies(result: LatencyResult, thresholdMultiplier = 2): TurnLatency[] {
  const anomalies: TurnLatency[] = [];
  const threshold = result.avgLatencyMs * thresholdMultiplier;

  for (const turn of result.turns) {
    if (turn.latencyMs > threshold && turn.latencyMs > 1000) {
      anomalies.push(turn);
    }
  }

  return anomalies;
}
