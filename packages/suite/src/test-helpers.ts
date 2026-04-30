import type { EvalResult } from '@reaatech/agent-eval-harness-types';
import type { SuiteConfig } from './config.js';
import type { AggregatedResults } from './results.js';
import type { EvalRunResult, OverallMetrics } from './runner.js';

export function makeSuiteConfig(overrides?: Partial<SuiteConfig>): SuiteConfig {
  return {
    name: 'test-suite',
    description: 'Test suite description',
    metrics: [
      { name: 'faithfulness', enabled: true, weight: 0.3, threshold: 0.8 },
      { name: 'relevance', enabled: true, weight: 0.3, threshold: 0.8 },
      { name: 'tool_correctness', enabled: true, weight: 0.2, threshold: 0.9 },
      { name: 'cost', enabled: true, weight: 0.1 },
      { name: 'latency', enabled: true, weight: 0.1 },
    ],
    ...overrides,
  };
}

export function makeEvalResult(overrides: Record<string, unknown> = {}): EvalResult {
  return {
    trajectory_id: 'traj-1',
    overall_score: 0.85,
    metrics: {
      faithfulness: 0.9,
      relevance: 0.85,
      tool_correctness: 0.95,
      cost_score: 0.97,
      latency_score: 0.88,
    },
    cost: 0.03,
    ...overrides,
  };
}

export function makeOverallMetrics(overrides?: Partial<OverallMetrics>): OverallMetrics {
  return {
    overallScore: 0.85,
    avgFaithfulness: 0.88,
    avgRelevance: 0.82,
    toolCorrectnessRate: 0.95,
    avgCostPerTask: 0.03,
    latencyP50: 800,
    latencyP90: 1200,
    latencyP99: 2500,
    slaViolations: 0,
    ...overrides,
  };
}

export function makeEvalRunResult(overrides?: Partial<EvalRunResult>): EvalRunResult {
  return {
    runId: 'eval-test-001',
    status: 'completed',
    startedAt: '2026-04-15T23:00:00Z',
    endedAt: '2026-04-15T23:01:00Z',
    totalTrajectories: 3,
    completedTrajectories: 3,
    failedTrajectories: 0,
    trajectoryResults: [],
    overallMetrics: makeOverallMetrics(),
    durationMs: 60000,
    ...overrides,
  };
}

export function makeAggregatedResults(overrides?: Partial<AggregatedResults>): AggregatedResults {
  return {
    runId: 'run-001',
    config: makeSuiteConfig(),
    overallMetrics: makeOverallMetrics(),
    metricBreakdown: {
      faithfulness: {
        name: 'faithfulness',
        avgScore: 0.88,
        minScore: 0.8,
        maxScore: 0.95,
        stdDev: 0.05,
        passRate: 1,
        weight: 0.3,
      },
      relevance: {
        name: 'relevance',
        avgScore: 0.82,
        minScore: 0.75,
        maxScore: 0.9,
        stdDev: 0.06,
        passRate: 0.9,
        weight: 0.3,
      },
    },
    trajectoryResults: [],
    summary: {
      totalTrajectories: 3,
      passedTrajectories: 3,
      failedTrajectories: 0,
      passRate: 100,
      overallPassed: true,
      durationMs: 60000,
    },
    timestamp: '2026-04-15T23:01:00Z',
    ...overrides,
  };
}
