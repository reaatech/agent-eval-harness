import type { EvalResult } from '@reaatech/agent-eval-harness-types';
import type { SuiteConfig } from './config.js';
import type { EvalRunResult, OverallMetrics } from './runner.js';

/**
 * Aggregated results
 */
export interface AggregatedResults {
  /** Run ID */
  runId: string;
  /** Suite configuration */
  config: SuiteConfig;
  /** Overall metrics */
  overallMetrics: OverallMetrics;
  /** Per-metric breakdown */
  metricBreakdown: Record<string, MetricBreakdown>;
  /** Per-trajectory results */
  trajectoryResults: TrajectoryResult[];
  /** Summary statistics */
  summary: SummaryStatistics;
  /** Timestamp */
  timestamp: string;
}

/**
 * Metric breakdown
 */
export interface MetricBreakdown {
  /** Metric name */
  name: string;
  /** Average score */
  avgScore: number;
  /** Min score */
  minScore: number;
  /** Max score */
  maxScore: number;
  /** Standard deviation */
  stdDev: number;
  /** Pass rate */
  passRate: number;
  /** Weight in overall score */
  weight: number;
}

/**
 * Per-trajectory result
 */
export interface TrajectoryResult {
  trajectoryId: string;
  overallScore: number;
  metricScores: Record<string, number>;
  passed: boolean;
  errors?: string;
}

/**
 * Summary statistics
 */
export interface SummaryStatistics {
  /** Total trajectories */
  totalTrajectories: number;
  /** Passed trajectories */
  passedTrajectories: number;
  /** Failed trajectories */
  failedTrajectories: number;
  /** Pass rate */
  passRate: number;
  /** Overall pass/fail */
  overallPassed: boolean;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Export format types
 */
export type ExportFormat = 'json' | 'junit' | 'csv' | 'markdown';

/**
 * Results aggregator
 */
export class ResultsAggregator {
  private config: SuiteConfig;

  constructor(config: SuiteConfig) {
    this.config = config;
  }

  /**
   * Aggregate results from a run
   */
  aggregate(runResult: EvalRunResult): AggregatedResults {
    const metricBreakdown = this.calculateMetricBreakdown(runResult);
    const trajectoryResults = this.calculateTrajectoryResults(runResult);
    const summary = this.calculateSummary(runResult, trajectoryResults);

    return {
      runId: runResult.runId,
      config: this.config,
      overallMetrics: runResult.overallMetrics,
      metricBreakdown,
      trajectoryResults,
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate per-metric breakdown
   */
  private calculateMetricBreakdown(runResult: EvalRunResult): Record<string, MetricBreakdown> {
    const breakdown: Record<string, MetricBreakdown> = {};

    for (const metric of this.config.metrics) {
      const scores = runResult.trajectoryResults
        .filter((r) => !r.error)
        .map((r) => this.extractMetricScore(r.result, metric.name))
        .filter((s) => s !== undefined && s !== null);

      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const variance = scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        const threshold = metric.threshold || 0;
        const passRate = scores.filter((s) => s >= threshold).length / scores.length;

        breakdown[metric.name] = {
          name: metric.name,
          avgScore: Math.round(avg * 1000) / 1000,
          minScore: Math.round(min * 1000) / 1000,
          maxScore: Math.round(max * 1000) / 1000,
          stdDev: Math.round(stdDev * 1000) / 1000,
          passRate: Math.round(passRate * 1000) / 1000,
          weight: metric.weight,
        };
      }
    }

    return breakdown;
  }

  /**
   * Extract metric score from result
   */
  private extractMetricScore(result: EvalResult, metricName: string): number | undefined {
    switch (metricName) {
      case 'faithfulness':
        return result.metrics.faithfulness;
      case 'relevance':
        return result.metrics.relevance;
      case 'tool_correctness':
        return result.metrics.tool_correctness;
      case 'cost': {
        if (result.metrics.cost_score !== undefined) {
          return result.metrics.cost_score;
        }
        const cost = result.cost || 0;
        return cost > 0 ? Math.max(0, 1 - cost) : 1;
      }
      case 'latency': {
        return result.metrics.latency_score;
      }
      default:
        return (result.metrics as Record<string, number | undefined>)[metricName];
    }
  }

  /**
   * Calculate per-trajectory results
   */
  private calculateTrajectoryResults(runResult: EvalRunResult): TrajectoryResult[] {
    return runResult.trajectoryResults.map((r) => {
      const metricScores: Record<string, number> = {};

      for (const metric of this.config.metrics) {
        metricScores[metric.name] = this.extractMetricScore(r.result, metric.name) || 0;
      }

      const overallScore = this.calculateWeightedScore(metricScores);
      const passed = this.checkTrajectoryPass(metricScores);

      const trajResult: TrajectoryResult = {
        trajectoryId: r.trajectoryId,
        overallScore: Math.round(overallScore * 1000) / 1000,
        metricScores,
        passed,
      };
      if (r.error) {
        trajResult.errors = r.error;
      }

      return trajResult;
    });
  }

  /**
   * Calculate weighted score
   */
  private calculateWeightedScore(metricScores: Record<string, number>): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const metric of this.config.metrics) {
      const score = metricScores[metric.name];
      if (metric.enabled && score !== undefined) {
        totalScore += score * metric.weight;
        totalWeight += metric.weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Check if trajectory passes all thresholds
   */
  private checkTrajectoryPass(metricScores: Record<string, number>): boolean {
    for (const metric of this.config.metrics) {
      if (metric.enabled && metric.threshold !== undefined) {
        const score = metricScores[metric.name];
        if (score !== undefined && score < metric.threshold) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    runResult: EvalRunResult,
    trajectoryResults: TrajectoryResult[],
  ): SummaryStatistics {
    const passed = trajectoryResults.filter((r) => r.passed).length;
    const failed = trajectoryResults.length - passed;

    return {
      totalTrajectories: runResult.totalTrajectories,
      passedTrajectories: passed,
      failedTrajectories: failed,
      passRate:
        trajectoryResults.length > 0
          ? Math.round((passed / trajectoryResults.length) * 10000) / 100
          : 0,
      overallPassed: failed === 0,
      durationMs: runResult.durationMs,
    };
  }

  /**
   * Export results to JSON
   */
  exportJSON(results: AggregatedResults): string {
    return JSON.stringify(results, null, 2);
  }

  /**
   * Export results to JUnit XML
   */
  exportJUnit(results: AggregatedResults): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuite name="${results.config.name}" tests="${results.summary.totalTrajectories}" failures="${results.summary.failedTrajectories}" errors="0" time="${(results.summary.durationMs / 1000).toFixed(3)}">`,
    ];

    for (const traj of results.trajectoryResults) {
      lines.push('  <testcase');
      lines.push(`    name="${traj.trajectoryId}"`);
      lines.push(`    classname="trajectory"`);
      lines.push(`    time="0"`);

      if (!traj.passed) {
        lines.push('>');
        lines.push(`    <failure message="Trajectory failed with score ${traj.overallScore}">`);
        lines.push(`      Overall Score: ${traj.overallScore}`);
        for (const [metric, score] of Object.entries(traj.metricScores)) {
          lines.push(`      ${metric}: ${score}`);
        }
        if (traj.errors) {
          lines.push(`      Error: ${traj.errors}`);
        }
        lines.push('    </failure>');
        lines.push('  </testcase>');
      } else {
        lines.push('/>');
      }
    }

    lines.push('</testsuite>');
    return lines.join('\n');
  }

  /**
   * Export results to CSV
   */
  exportCSV(results: AggregatedResults): string {
    const headers = [
      'trajectory_id',
      'overall_score',
      'passed',
      ...this.config.metrics.map((m) => m.name),
    ];
    const lines = [headers.join(',')];

    for (const traj of results.trajectoryResults) {
      const row = [
        traj.trajectoryId,
        traj.overallScore.toString(),
        traj.passed ? 'true' : 'false',
        ...this.config.metrics.map((m) => (traj.metricScores[m.name] || 0).toString()),
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Export results to Markdown
   */
  exportMarkdown(results: AggregatedResults): string {
    const lines: string[] = [
      `# Evaluation Results: ${results.config.name}`,
      '',
      `**Run ID:** ${results.runId}`,
      `**Timestamp:** ${results.timestamp}`,
      `**Duration:** ${(results.summary.durationMs / 1000).toFixed(1)}s`,
      '',
      '## Summary',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Trajectories | ${results.summary.totalTrajectories} |`,
      `| Passed | ${results.summary.passedTrajectories} |`,
      `| Failed | ${results.summary.failedTrajectories} |`,
      `| Pass Rate | ${results.summary.passRate}% |`,
      `| Overall Score | ${results.overallMetrics.overallScore} |`,
      '',
      '## Metric Breakdown',
      '',
      '| Metric | Avg | Min | Max | Std Dev | Pass Rate | Weight |',
      '|--------|-----|-----|-----|---------|-----------|--------|',
    ];

    for (const [, breakdown] of Object.entries(results.metricBreakdown)) {
      lines.push(
        `| ${breakdown.name} | ${breakdown.avgScore} | ${breakdown.minScore} | ${breakdown.maxScore} | ${breakdown.stdDev} | ${Math.round(breakdown.passRate * 100)}% | ${breakdown.weight} |`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Export results in specified format
   */
  export(results: AggregatedResults, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return this.exportJSON(results);
      case 'junit':
        return this.exportJUnit(results);
      case 'csv':
        return this.exportCSV(results);
      case 'markdown':
        return this.exportMarkdown(results);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }
}

/**
 * Create results aggregator
 */
export function createResultsAggregator(config: SuiteConfig): ResultsAggregator {
  return new ResultsAggregator(config);
}
