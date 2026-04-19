import type { Trajectory } from '../types/domain.js';
import type { EvalResult } from '../types/domain.js';

/**
 * Evaluation run status
 */
export type EvalRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

/**
 * Evaluation run result
 */
export interface EvalRunResult {
  /** Unique run identifier */
  runId: string;
  /** Run status */
  status: EvalRunStatus;
  /** Start timestamp */
  startedAt: string;
  /** End timestamp */
  endedAt?: string;
  /** Total trajectories */
  totalTrajectories: number;
  /** Completed trajectories */
  completedTrajectories: number;
  /** Failed trajectories */
  failedTrajectories: number;
  /** Per-trajectory results */
  trajectoryResults: Array<{
    trajectoryId: string;
    result: EvalResult;
    error?: string;
  }>;
  /** Overall metrics */
  overallMetrics: OverallMetrics;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Overall metrics summary
 */
export interface OverallMetrics {
  /** Overall quality score */
  overallScore: number;
  /** Average faithfulness */
  avgFaithfulness: number;
  /** Average relevance */
  avgRelevance: number;
  /** Tool correctness rate */
  toolCorrectnessRate: number;
  /** Average cost per task */
  avgCostPerTask: number;
  /** P50 latency */
  latencyP50: number;
  /** P90 latency */
  latencyP90: number;
  /** P99 latency */
  latencyP99: number;
  /** SLA violations */
  slaViolations: number;
}

/**
 * Progress update
 */
export interface ProgressUpdate {
  runId: string;
  status: EvalRunStatus;
  progress: number;
  completed: number;
  total: number;
  currentTrajectory?: string;
}

/**
 * Evaluation suite configuration
 */
export interface SuiteRunnerConfig {
  /** Concurrency level */
  concurrency: number;
  /** Whether to continue on errors */
  continueOnError: boolean;
  /** Timeout per trajectory in ms */
  timeoutMs: number;
  /** Metrics to evaluate */
  metrics: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SuiteRunnerConfig = {
  concurrency: 5,
  continueOnError: true,
  timeoutMs: 60000,
  metrics: ['faithfulness', 'relevance', 'tool_correctness', 'cost', 'latency'],
};

/**
 * Evaluation Suite Runner
 */
export class SuiteRunner {
  private config: SuiteRunnerConfig;
  private progressCallback?: (update: ProgressUpdate) => void;

  constructor(
    config: Partial<SuiteRunnerConfig> = {},
    progressCallback?: (update: ProgressUpdate) => void,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (progressCallback) {
      this.progressCallback = progressCallback;
    }
  }

  /**
   * Run evaluation suite on multiple trajectories
   */
  async run(
    trajectories: Trajectory[],
    evaluator: (trajectory: Trajectory) => Promise<EvalResult>,
  ): Promise<EvalRunResult> {
    const runId = `eval-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const trajectoryResults: EvalRunResult['trajectoryResults'] = [];
    let completed = 0;
    let failed = 0;

    // Report start
    this.reportProgress(runId, 'running', 0, 0, trajectories.length);

    // Process in batches
    for (let i = 0; i < trajectories.length; i += this.config.concurrency) {
      const batch = trajectories.slice(i, i + this.config.concurrency);
      const promises = batch.map(async (trajectory) => {
        const trajectoryId = trajectory.trajectory_id || `traj-${i}`;

        try {
          const result = await Promise.race([
            evaluator(trajectory),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), this.config.timeoutMs),
            ),
          ]);

          completed++;
          trajectoryResults.push({ trajectoryId, result });
        } catch (error) {
          failed++;
          trajectoryResults.push({
            trajectoryId,
            result: this.getEmptyResult(),
            error: (error as Error).message,
          });

          if (!this.config.continueOnError) {
            throw error;
          }
        }

        this.reportProgress(
          runId,
          'running',
          completed,
          completed + failed,
          trajectories.length,
          trajectoryId,
        );
      });

      await Promise.all(promises);
    }

    const durationMs = Date.now() - startTime;
    const overallMetrics = this.calculateOverallMetrics(trajectoryResults);

    const result: EvalRunResult = {
      runId,
      status: failed > 0 && completed > 0 ? 'partial' : failed > 0 ? 'failed' : 'completed',
      startedAt,
      endedAt: new Date().toISOString(),
      totalTrajectories: trajectories.length,
      completedTrajectories: completed,
      failedTrajectories: failed,
      trajectoryResults,
      overallMetrics,
      durationMs,
    };

    this.reportProgress(
      runId,
      result.status,
      completed + failed,
      trajectories.length,
      trajectories.length,
    );

    return result;
  }

  /**
   * Calculate overall metrics from results
   */
  private calculateOverallMetrics(results: EvalRunResult['trajectoryResults']): OverallMetrics {
    const validResults = results.filter((r) => !r.error);

    if (validResults.length === 0) {
      return {
        overallScore: 0,
        avgFaithfulness: 0,
        avgRelevance: 0,
        toolCorrectnessRate: 0,
        avgCostPerTask: 0,
        latencyP50: 0,
        latencyP90: 0,
        latencyP99: 0,
        slaViolations: 0,
      };
    }

    const scores = validResults.map((r) => r.result);

    const latencyScores = scores
      .map((r) => r.metrics.latency_score)
      .filter((s): s is number => s !== undefined);

    return {
      overallScore:
        Math.round((scores.reduce((s, r) => s + r.overall_score, 0) / scores.length) * 1000) / 1000,
      avgFaithfulness:
        Math.round(
          (scores.reduce((s, r) => s + (r.metrics.faithfulness || 0), 0) / scores.length) * 1000,
        ) / 1000,
      avgRelevance:
        Math.round(
          (scores.reduce((s, r) => s + (r.metrics.relevance || 0), 0) / scores.length) * 1000,
        ) / 1000,
      toolCorrectnessRate:
        Math.round(
          (scores.reduce((s, r) => s + (r.metrics.tool_correctness || 0), 0) / scores.length) *
            1000,
        ) / 1000,
      avgCostPerTask:
        Math.round((scores.reduce((s, r) => s + (r.cost || 0), 0) / scores.length) * 10000) / 10000,
      latencyP50: latencyScores.length > 0 ? this.percentile(latencyScores, 50) : 0,
      latencyP90: latencyScores.length > 0 ? this.percentile(latencyScores, 90) : 0,
      latencyP99: latencyScores.length > 0 ? this.percentile(latencyScores, 99) : 0,
      slaViolations:
        latencyScores.length < scores.length ? scores.length - latencyScores.length : 0,
    };
  }

  /**
   * Get empty result for failed evaluations
   */
  private getEmptyResult(): EvalResult {
    return {
      trajectory_id: '',
      overall_score: 0,
      metrics: {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate percentile from sorted values
   */
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round((sorted[Math.max(0, idx)] || 0) * 1000) / 1000;
  }

  /**
   * Report progress
   */
  private reportProgress(
    runId: string,
    status: EvalRunStatus,
    completed: number,
    processed: number,
    total: number,
    currentTrajectory?: string,
  ): void {
    if (this.progressCallback) {
      const update: ProgressUpdate = {
        runId,
        status,
        progress: total > 0 ? Math.round((processed / total) * 100) : 0,
        completed,
        total,
      };
      if (currentTrajectory !== undefined) {
        update.currentTrajectory = currentTrajectory;
      }
      this.progressCallback(update);
    }
  }
}

/**
 * Create a suite runner
 */
export function createSuiteRunner(config?: Partial<SuiteRunnerConfig>): SuiteRunner {
  return new SuiteRunner(config);
}
