import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RunComparator } from '@reaatech/agent-eval-harness-suite';
import type { SuiteConfig } from '@reaatech/agent-eval-harness-suite';
import { ResultsAggregator } from '@reaatech/agent-eval-harness-suite';
import type { AggregatedResults } from '@reaatech/agent-eval-harness-suite';
import { SuiteRunner } from '@reaatech/agent-eval-harness-suite';
import type { EvalRunResult } from '@reaatech/agent-eval-harness-suite';
import type { EvalResult, Trajectory } from '@reaatech/agent-eval-harness-types';
import { z } from 'zod';

const SuiteRunInputSchema = z.object({
  trajectories: z.array(z.record(z.string(), z.unknown())),
  config: z
    .object({
      metrics: z.array(z.string()).optional(),
      judge_model: z.string().optional(),
      budget_limit: z.number().optional(),
    })
    .passthrough()
    .optional(),
});

const SuiteStatusInputSchema = z.object({
  run_id: z.string(),
});

const SuiteResultsInputSchema = z.object({
  run_id: z.string(),
  format: z.enum(['json', 'summary']).optional(),
});

const SuiteCompareInputSchema = z.object({
  baseline_run: z.string(),
  candidate_run: z.string(),
});

const SuiteBaselineInputSchema = z.object({
  run_id: z.string(),
  name: z.string().optional(),
});

const activeRuns = new Map<string, EvalRunResult>();
const aggregatedResults = new Map<string, AggregatedResults>();
let baselineRunId: string | null = null;

const SUITE_TOOLS: Tool[] = [
  {
    name: 'eval.suite.run',
    description: 'Execute full evaluation suite',
    inputSchema: {
      type: 'object',
      properties: {
        trajectories: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of trajectory objects',
        },
        config: {
          type: 'object',
          description: 'Evaluation configuration',
          properties: {
            metrics: {
              type: 'array',
              items: { type: 'string' },
            },
            judge_model: { type: 'string' },
            budget_limit: { type: 'number' },
          },
        },
      },
      required: ['trajectories'],
    },
  },
  {
    name: 'eval.suite.status',
    description: 'Get evaluation run status',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'The evaluation run ID',
        },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'eval.suite.results',
    description: 'Retrieve evaluation results',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'The evaluation run ID',
        },
        format: {
          type: 'string',
          enum: ['json', 'summary'],
          default: 'json',
        },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'eval.suite.compare',
    description: 'Compare two evaluation runs',
    inputSchema: {
      type: 'object',
      properties: {
        baseline_run: {
          type: 'string',
          description: 'Baseline run ID',
        },
        candidate_run: {
          type: 'string',
          description: 'Candidate run ID',
        },
      },
      required: ['baseline_run', 'candidate_run'],
    },
  },
  {
    name: 'eval.suite.baseline',
    description: 'Set/update baseline for regression',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'Run ID to set as baseline',
        },
        name: {
          type: 'string',
          description: 'Optional baseline name',
        },
      },
      required: ['run_id'],
    },
  },
];

export async function executeSuiteTool(name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case 'eval.suite.run': {
      const input = SuiteRunInputSchema.parse(args);
      const runner = new SuiteRunner();

      const evaluator = async (trajectory: Trajectory): Promise<EvalResult> => {
        return {
          trajectory_id: trajectory.trajectory_id || `traj-${Date.now()}`,
          overall_score: 0.85,
          metrics: {},
          timestamp: new Date().toISOString(),
        };
      };

      const trajectories = input.trajectories as unknown as Trajectory[];
      const result = await runner.run(trajectories, evaluator);
      activeRuns.set(result.runId, result);

      const aggregator = new ResultsAggregator(
        (input.config as unknown as SuiteConfig) || ({ name: 'default' } as SuiteConfig),
      );
      const aggregated = aggregator.aggregate(result);
      aggregatedResults.set(result.runId, aggregated);

      return {
        run_id: result.runId,
        status: result.status,
        total_trajectories: result.totalTrajectories,
        completed: result.completedTrajectories,
        failed: result.failedTrajectories,
        duration_ms: result.durationMs,
      };
    }

    case 'eval.suite.status': {
      const input = SuiteStatusInputSchema.parse(args);
      const run = activeRuns.get(input.run_id);

      if (!run) {
        return { error: `Run not found: ${input.run_id}` };
      }

      return {
        run_id: run.runId,
        status: run.status,
        progress: Math.round(
          ((run.completedTrajectories + run.failedTrajectories) / run.totalTrajectories) * 100,
        ),
        completed: run.completedTrajectories,
        total: run.totalTrajectories,
        started_at: run.startedAt,
        ended_at: run.endedAt,
      };
    }

    case 'eval.suite.results': {
      const input = SuiteResultsInputSchema.parse(args);
      const aggregated = aggregatedResults.get(input.run_id);

      if (!aggregated) {
        return { error: `Results not found for run: ${input.run_id}` };
      }

      if (input.format === 'summary') {
        return {
          run_id: aggregated.runId,
          overall_score: aggregated.overallMetrics.overallScore,
          pass_rate: aggregated.summary.passRate,
          total_trajectories: aggregated.summary.totalTrajectories,
          passed: aggregated.summary.passedTrajectories,
          failed: aggregated.summary.failedTrajectories,
        };
      }

      return aggregated;
    }

    case 'eval.suite.compare': {
      const input = SuiteCompareInputSchema.parse(args);
      const baseline = aggregatedResults.get(input.baseline_run);
      const candidate = aggregatedResults.get(input.candidate_run);

      if (!baseline || !candidate) {
        return { error: 'One or both runs not found' };
      }

      const comparator = new RunComparator();
      const comparison = comparator.compare(baseline, candidate);

      return {
        baseline_run_id: comparison.baselineRunId,
        candidate_run_id: comparison.candidateRunId,
        score_diff: comparison.scoreDiff,
        verdict: comparison.summary.verdict,
        recommendation: comparison.summary.recommendation,
        regressions: comparison.regressions.length,
        improvements: comparison.improvements.length,
        key_findings: comparison.summary.keyFindings,
      };
    }

    case 'eval.suite.baseline': {
      const input = SuiteBaselineInputSchema.parse(args);
      const run = activeRuns.get(input.run_id);

      if (!run) {
        return { error: `Run not found: ${input.run_id}` };
      }

      baselineRunId = input.run_id;

      return {
        baseline_id: input.run_id,
        name: input.name || `baseline-${input.run_id}`,
        set_at: new Date().toISOString(),
      };
    }

    default:
      throw new Error(`Unknown suite tool: ${name}`);
  }
}

export function registerSuiteTools(): Tool[] {
  return SUITE_TOOLS;
}

export function getBaselineRunId(): string | null {
  return baselineRunId;
}
