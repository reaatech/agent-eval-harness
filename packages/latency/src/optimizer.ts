import type { Trajectory } from '@reaatech/agent-eval-harness-types';
import type { LatencyResult, TurnLatency } from './monitor.js';

export interface OptimizationRecommendation {
  type: RecommendationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  expectedImprovementMs?: number;
  affectedTurns?: number[];
  effort: 'low' | 'medium' | 'high';
}

export type RecommendationType =
  | 'reduce_prompt_length'
  | 'use_faster_model'
  | 'batch_tool_calls'
  | 'cache_responses'
  | 'parallel_tool_calls'
  | 'stream_responses'
  | 'optimize_tool_selection'
  | 'reduce_turns'
  | 'simplify_reasoning'
  | 'use_smaller_model';

export interface Bottleneck {
  type: 'llm_call' | 'tool_invocation' | 'overhead' | 'total';
  severity: number;
  description: string;
  affectedTurns: TurnLatency[];
  avgLatencyMs: number;
}

export interface OptimizationResult {
  bottlenecks: Bottleneck[];
  recommendations: OptimizationRecommendation[];
  score: number;
  estimatedImprovementMs: number;
}

export function analyzeOptimization(
  result: LatencyResult,
  trajectory?: Trajectory,
): OptimizationResult {
  const bottlenecks = identifyBottlenecks(result);
  const recommendations = generateRecommendations(result, bottlenecks, trajectory);
  const estimatedImprovement = estimateTotalImprovement(recommendations);
  const score = calculateOptimizationScore(result, bottlenecks);

  return {
    bottlenecks,
    recommendations,
    score,
    estimatedImprovementMs: estimatedImprovement,
  };
}

function identifyBottlenecks(result: LatencyResult): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  const llmLatencies = result.turns
    .filter((t) => t.llmCallMs && t.llmCallMs > 0)
    .map((t) => t.llmCallMs as number);

  if (llmLatencies.length > 0) {
    const avgLlm = llmLatencies.reduce((a, b) => a + b, 0) / llmLatencies.length;
    const maxLlm = Math.max(...llmLatencies);

    if (avgLlm > 1000 || maxLlm > 3000) {
      bottlenecks.push({
        type: 'llm_call',
        severity: Math.min(1, avgLlm / 2000),
        description: `LLM call latency is high (avg: ${avgLlm.toFixed(0)}ms, max: ${maxLlm.toFixed(0)}ms)`,
        affectedTurns: result.turns.filter((t) => (t.llmCallMs || 0) > avgLlm * 1.5),
        avgLatencyMs: Math.round(avgLlm * 100) / 100,
      });
    }
  }

  const toolLatencies = result.turns
    .filter((t) => t.toolInvocationMs && t.toolInvocationMs > 0)
    .map((t) => t.toolInvocationMs as number);

  if (toolLatencies.length > 0) {
    const avgTool = toolLatencies.reduce((a, b) => a + b, 0) / toolLatencies.length;
    const maxTool = Math.max(...toolLatencies);

    if (avgTool > 200 || maxTool > 500) {
      bottlenecks.push({
        type: 'tool_invocation',
        severity: Math.min(1, avgTool / 500),
        description: `Tool invocation latency is high (avg: ${avgTool.toFixed(0)}ms, max: ${maxTool.toFixed(0)}ms)`,
        affectedTurns: result.turns.filter((t) => (t.toolInvocationMs || 0) > avgTool * 1.5),
        avgLatencyMs: Math.round(avgTool * 100) / 100,
      });
    }
  }

  const overheadLatencies = result.turns
    .filter((t) => t.overheadMs && t.overheadMs > 0)
    .map((t) => t.overheadMs as number);

  if (overheadLatencies.length > 0) {
    const avgOverhead = overheadLatencies.reduce((a, b) => a + b, 0) / overheadLatencies.length;

    if (avgOverhead > 200) {
      bottlenecks.push({
        type: 'overhead',
        severity: Math.min(1, avgOverhead / 500),
        description: `System overhead is high (avg: ${avgOverhead.toFixed(0)}ms)`,
        affectedTurns: result.turns.filter((t) => (t.overheadMs || 0) > avgOverhead * 1.5),
        avgLatencyMs: Math.round(avgOverhead * 100) / 100,
      });
    }
  }

  if (result.p99Ms > 5000) {
    bottlenecks.push({
      type: 'total',
      severity: Math.min(1, result.p99Ms / 10000),
      description: `P99 latency is very high (${result.p99Ms.toFixed(0)}ms)`,
      affectedTurns: result.turns.filter((t) => t.latencyMs > result.p99Ms * 0.8),
      avgLatencyMs: result.p99Ms,
    });
  }

  return bottlenecks.sort((a, b) => b.severity - a.severity);
}

function generateRecommendations(
  result: LatencyResult,
  bottlenecks: Bottleneck[],
  trajectory?: Trajectory,
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  for (const bottleneck of bottlenecks) {
    switch (bottleneck.type) {
      case 'llm_call':
        recommendations.push(...getLlmRecommendations(result, bottleneck, trajectory));
        break;
      case 'tool_invocation':
        recommendations.push(...getToolRecommendations(result, bottleneck));
        break;
      case 'overhead':
        recommendations.push(...getOverheadRecommendations(result, bottleneck));
        break;
      case 'total':
        recommendations.push(...getTotalLatencyRecommendations(result, bottleneck));
        break;
    }
  }

  if (trajectory) {
    const agentTurns = trajectory.turns.filter((t) => t.role === 'agent');
    if (agentTurns.length > 5) {
      recommendations.push({
        type: 'reduce_turns',
        priority: 'medium',
        description: `Consider reducing conversation length (currently ${agentTurns.length} agent turns)`,
        expectedImprovementMs: agentTurns.length * 100,
        effort: 'high',
      });
    }
  }

  const unique = recommendations.filter(
    (r, i, arr) => arr.findIndex((x) => x.type === r.type) === i,
  );

  return unique.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function getLlmRecommendations(
  _result: LatencyResult,
  bottleneck: Bottleneck,
  trajectory?: Trajectory,
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  if (bottleneck.avgLatencyMs > 2000) {
    recommendations.push({
      type: 'use_faster_model',
      priority: 'high',
      description:
        'Consider using a faster model (e.g., Claude Haiku instead of Opus, or GPT-4 Mini instead of GPT-4)',
      expectedImprovementMs: bottleneck.avgLatencyMs * 0.5,
      effort: 'low',
    });
  }

  if (trajectory) {
    const avgContentLength =
      trajectory.turns.reduce((sum, t) => sum + t.content.length, 0) / trajectory.turns.length;

    if (avgContentLength > 500) {
      recommendations.push({
        type: 'reduce_prompt_length',
        priority: 'medium',
        description: `Reduce prompt/response length (current avg: ${Math.round(avgContentLength)} chars)`,
        expectedImprovementMs: bottleneck.avgLatencyMs * 0.2,
        effort: 'medium',
      });
    }
  }

  if (bottleneck.avgLatencyMs > 3000) {
    recommendations.push({
      type: 'stream_responses',
      priority: 'medium',
      description: 'Enable streaming responses to improve perceived latency',
      expectedImprovementMs: bottleneck.avgLatencyMs * 0.3,
      effort: 'medium',
    });
  }

  return recommendations;
}

function getToolRecommendations(
  result: LatencyResult,
  bottleneck: Bottleneck,
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  const turnsWithMultipleTools = result.turns.filter(
    (t) => (t.toolInvocationMs || 0) > bottleneck.avgLatencyMs,
  );

  if (turnsWithMultipleTools.length > 0) {
    recommendations.push({
      type: 'batch_tool_calls',
      priority: 'high',
      description: `${turnsWithMultipleTools.length} turns have high tool latency - consider batching tool calls`,
      expectedImprovementMs: bottleneck.avgLatencyMs * 0.4,
      affectedTurns: turnsWithMultipleTools.map((t) => t.turnId),
      effort: 'medium',
    });
  }

  recommendations.push({
    type: 'parallel_tool_calls',
    priority: 'medium',
    description: 'Execute independent tool calls in parallel',
    expectedImprovementMs: bottleneck.avgLatencyMs * 0.3,
    effort: 'medium',
  });

  recommendations.push({
    type: 'optimize_tool_selection',
    priority: 'medium',
    description: 'Review tool selection to use faster alternatives where possible',
    expectedImprovementMs: bottleneck.avgLatencyMs * 0.2,
    effort: 'high',
  });

  return recommendations;
}

function getOverheadRecommendations(
  _result: LatencyResult,
  bottleneck: Bottleneck,
): OptimizationRecommendation[] {
  return [
    {
      type: 'simplify_reasoning',
      priority: 'medium',
      description: 'Simplify agent reasoning to reduce processing overhead',
      expectedImprovementMs: bottleneck.avgLatencyMs * 0.3,
      effort: 'high',
    },
    {
      type: 'cache_responses',
      priority: 'low',
      description: 'Implement response caching for common queries',
      expectedImprovementMs: bottleneck.avgLatencyMs * 0.2,
      effort: 'medium',
    },
  ];
}

function getTotalLatencyRecommendations(
  result: LatencyResult,
  bottleneck: Bottleneck,
): OptimizationRecommendation[] {
  return [
    {
      type: 'use_smaller_model',
      priority: 'critical',
      description: 'Switch to a smaller/faster model to significantly reduce latency',
      expectedImprovementMs: bottleneck.avgLatencyMs * 0.4,
      effort: 'low',
    },
    {
      type: 'reduce_turns',
      priority: 'high',
      description: 'Reduce number of turns in trajectory (implement early termination)',
      expectedImprovementMs: result.totalLatencyMs * 0.2,
      effort: 'high',
    },
  ];
}

function estimateTotalImprovement(recommendations: OptimizationRecommendation[]): number {
  const topRecommendations = recommendations.slice(0, 3);
  return (
    Math.round(
      topRecommendations.reduce((sum, r) => sum + (r.expectedImprovementMs || 0), 0) * 100,
    ) / 100
  );
}

function calculateOptimizationScore(_result: LatencyResult, bottlenecks: Bottleneck[]): number {
  if (bottlenecks.length === 0) return 1.0;

  const severityWeight = bottlenecks.reduce((sum, b) => sum + b.severity, 0);

  const normalizedSeverity = severityWeight / bottlenecks.length;

  return Math.max(0, Math.round((1 - normalizedSeverity * 0.5) * 100) / 100);
}

export class LatencyTracker {
  private history: Array<{
    timestamp: string;
    result: LatencyResult;
    score: number;
  }> = [];

  record(result: LatencyResult): void {
    const analysis = analyzeOptimization(result);
    this.history.push({
      timestamp: new Date().toISOString(),
      result,
      score: analysis.score,
    });
  }

  getTrend(): { improving: boolean; improvementRate: number } {
    if (this.history.length < 2) {
      return { improving: true, improvementRate: 0 };
    }

    const recent = this.history.slice(-5);
    const scores = recent.map((h) => h.score);

    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.ceil(scores.length / 2));

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const improvementRate = avgSecond - avgFirst;

    return {
      improving: improvementRate >= 0,
      improvementRate: Math.round(improvementRate * 100) / 100,
    };
  }

  getAverageScore(): number {
    if (this.history.length === 0) return 1.0;
    const avg = this.history.reduce((sum, h) => sum + h.score, 0) / this.history.length;
    return Math.round(avg * 100) / 100;
  }

  getHistory(): typeof this.history {
    return [...this.history];
  }
}
