import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { loadFromFile } from '../../trajectory/loader.js';
import { evaluate } from '../../trajectory/evaluator.js';
import { compare as compareTrajectory } from '../../trajectory/comparator.js';
import { validateTrajectory } from '../../tool-use/validator.js';
import { calculateTrajectoryCost } from '../../cost/tracker.js';
import { loadGoldenTrajectories } from '../../golden/manager.js';
import type { EvalResult, Trajectory } from '../../types/domain.js';
import type {
  AggregatedResults,
  MetricBreakdown,
  TrajectoryResult,
  SummaryStatistics,
} from '../../suite/results.js';
import type { OverallMetrics } from '../../suite/runner.js';
import { createDefaultConfig } from '../../suite/config.js';
import { cliOut, cliError, cliWarn } from '../output.js';

export interface EvalOptions {
  golden?: string;
  metrics?: string;
  judgeModel?: string;
  noJudge?: boolean;
  budget?: string;
  format?: string;
  verbose?: boolean;
  config?: string;
  output?: string;
}

export async function evalCommand(paths: string[], options: EvalOptions): Promise<void> {
  const {
    golden: goldenPath,
    format = 'json',
    output = 'results',
    judgeModel = 'claude-opus',
  } = options;

  const trajectoryFiles = collectTrajectoryFiles(paths);

  if (trajectoryFiles.length === 0) {
    cliError('No trajectory files found');
    process.exit(1);
  }

  cliOut(`Found ${trajectoryFiles.length} trajectory files`);

  const startTime = Date.now();
  const results: EvalResult[] = [];
  let totalCost = 0;

  for (const file of trajectoryFiles) {
    cliOut(`Processing: ${file}`);

    try {
      const trajectory: Trajectory = await loadFromFile(file);
      const evalResult: EvalResult = evaluate(trajectory);
      const toolValidationResults = validateTrajectory(trajectory);
      const costBreakdown = calculateTrajectoryCost(trajectory, judgeModel);
      totalCost += costBreakdown.total_cost;

      // Compute proxy metrics for gate compatibility
      const validTools = toolValidationResults.filter((v) => v.valid).length;
      const totalTools = toolValidationResults.length;
      const toolCorrectness = totalTools > 0 ? validTools / totalTools : 1;

      const latencies = trajectory.turns
        .filter((t) => t.role === 'agent' && typeof t.latency_ms === 'number')
        .map((t) => t.latency_ms!);
      const avgLatency =
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

      evalResult.metrics.faithfulness = evalResult.metrics.coherence ?? evalResult.overall_score;
      evalResult.metrics.relevance = evalResult.metrics.goal_completion ?? evalResult.overall_score;
      evalResult.metrics.tool_correctness = toolCorrectness;
      evalResult.metrics.cost_score =
        costBreakdown.total_cost > 0 ? Math.max(0, 1 - costBreakdown.total_cost / 0.1) : 1;
      evalResult.metrics.latency_score = avgLatency > 0 ? Math.max(0, 1 - avgLatency / 5000) : 1;

      let similarityScore: number | undefined;
      if (goldenPath) {
        try {
          const fs = await import('fs');
          const goldenContent = fs.readFileSync(goldenPath, 'utf-8');
          const goldens = loadGoldenTrajectories(goldenContent);
          if (goldens.length > 0) {
            const comparison = compareTrajectory(trajectory, goldens[0]!.trajectory);
            similarityScore = comparison.similarity;
          }
        } catch (err) {
          cliWarn(
            `  Skipping golden comparison for ${file}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const resultEntry: EvalResult = {
        file,
        trajectory_id: evalResult.trajectory_id,
        overall_score: evalResult.overall_score,
        metrics: { ...evalResult.metrics },
        quality: evalResult.overall_score,
        cost: costBreakdown.total_cost,
      };
      if (evalResult.passed !== undefined) {
        resultEntry.passed = evalResult.passed;
      }
      if (evalResult.evaluated_at !== undefined) {
        resultEntry.evaluated_at = evalResult.evaluated_at;
      }
      if (evalResult.issues) {
        resultEntry.issues = [...evalResult.issues];
      }
      if (similarityScore !== undefined) {
        resultEntry.overall_score = (evalResult.overall_score + similarityScore) / 2;
      }
      results.push(resultEntry);

      if (options.verbose) {
        cliOut(`  Quality: ${evalResult.overall_score.toFixed(3)}`);
        cliOut(`  Cost: $${costBreakdown.total_cost.toFixed(4)}`);
        cliOut(
          `  Tool validations: ${toolValidationResults.filter((v) => v.valid).length}/${toolValidationResults.length} passed`,
        );
      }
    } catch (error) {
      cliError(`  Error processing ${file}:`, error);
      results.push({
        file,
        trajectory_id: `traj-${Date.now()}-error`,
        overall_score: 0,
        metrics: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        passed: false,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const avgQuality =
    results.length > 0 ? results.reduce((sum, r) => sum + r.overall_score, 0) / results.length : 0;
  const avgCost = results.length > 0 ? totalCost / results.length : 0;
  const passRate = results.length > 0 ? (passedCount / results.length) * 100 : 0;

  mkdirSync(output, { recursive: true });

  // Build AggregatedResults format for gate compatibility
  const metricNames = [
    'overall_score',
    'faithfulness',
    'relevance',
    'tool_correctness',
    'cost',
    'latency',
  ];
  const metricBreakdown: Record<string, MetricBreakdown> = {};

  for (const name of metricNames) {
    const scores = results
      .filter((r) => !r.error)
      .map((r) => extractMetricValue(r, name))
      .filter((s): s is number => s !== undefined && s !== null && !Number.isNaN(s));

    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const variance = scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      const passRateMetric = scores.filter((s) => s >= 0.7).length / scores.length;

      metricBreakdown[name] = {
        name,
        avgScore: Math.round(avg * 1000) / 1000,
        minScore: Math.round(min * 1000) / 1000,
        maxScore: Math.round(max * 1000) / 1000,
        stdDev: Math.round(stdDev * 1000) / 1000,
        passRate: Math.round(passRateMetric * 1000) / 1000,
        weight: 1,
      };
    }
  }

  const trajectoryResults: TrajectoryResult[] = results.map((r) => ({
    trajectoryId: r.trajectory_id || 'unknown',
    overallScore: r.overall_score,
    metricScores: {
      overall_score: r.overall_score,
      faithfulness: r.metrics.faithfulness ?? 0,
      relevance: r.metrics.relevance ?? 0,
      tool_correctness: r.metrics.tool_correctness ?? 0,
      cost: r.cost ?? 0,
      latency: r.metrics.latency_score ?? 0,
    },
    passed: !!r.passed,
    ...(r.error ? { errors: r.error } : {}),
  }));

  const allLatencies = results
    .map((r) => r.metrics.latency_score)
    .filter((s): s is number => s !== undefined);

  const overallMetrics: OverallMetrics = {
    overallScore: Math.round(avgQuality * 1000) / 1000,
    avgFaithfulness: metricBreakdown.faithfulness?.avgScore ?? 0,
    avgRelevance: metricBreakdown.relevance?.avgScore ?? 0,
    toolCorrectnessRate: metricBreakdown.tool_correctness?.avgScore ?? 0,
    avgCostPerTask: avgCost,
    latencyP50: allLatencies.length > 0 ? percentile(allLatencies, 50) : 0,
    latencyP90: allLatencies.length > 0 ? percentile(allLatencies, 90) : 0,
    latencyP99: allLatencies.length > 0 ? percentile(allLatencies, 99) : 0,
    slaViolations: results.filter((r) => r.metrics.latency_score === undefined && !r.error).length,
  };

  const summary: SummaryStatistics = {
    totalTrajectories: results.length,
    passedTrajectories: passedCount,
    failedTrajectories: failedCount,
    passRate: Math.round(passRate * 100) / 100,
    overallPassed: failedCount === 0,
    durationMs,
  };

  const outputData: AggregatedResults = {
    runId: `run-${Date.now()}`,
    config: createDefaultConfig('eval-cli'),
    overallMetrics,
    metricBreakdown,
    trajectoryResults,
    summary,
    timestamp: new Date().toISOString(),
  };

  const resultsFile = join(output, `results.${format}`);

  if (format === 'json') {
    writeFileSync(resultsFile, JSON.stringify(outputData, null, 2));
  } else if (format === 'csv') {
    writeFileSync(resultsFile, generateCSV(results));
  }

  cliOut('\n=== Evaluation Summary ===');
  cliOut(`Trajectories: ${results.length}`);
  cliOut(`Passed: ${passedCount}`);
  cliOut(`Failed: ${failedCount}`);
  cliOut(`Pass Rate: ${passRate.toFixed(1)}%`);
  cliOut(`Average Quality: ${avgQuality.toFixed(3)}`);
  cliOut(`Average Cost: $${avgCost.toFixed(4)}`);
  cliOut(`Total Cost: $${totalCost.toFixed(4)}`);
  cliOut(`Results saved to: ${resultsFile}`);
}

function extractMetricValue(result: EvalResult, metricName: string): number | undefined {
  switch (metricName) {
    case 'overall_score':
      return result.overall_score;
    case 'faithfulness':
      return result.metrics.faithfulness;
    case 'relevance':
      return result.metrics.relevance;
    case 'tool_correctness':
      return result.metrics.tool_correctness;
    case 'cost':
      return result.cost;
    case 'latency':
      return result.metrics.latency_score;
    default:
      return (result.metrics as Record<string, number | undefined>)[metricName];
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round((sorted[Math.max(0, idx)] || 0) * 1000) / 1000;
}

function collectTrajectoryFiles(paths: string[]): string[] {
  const files: string[] = [];

  for (const path of paths) {
    const resolved = resolve(path);

    if (!existsSync(resolved)) {
      cliWarn(`Path not found: ${resolved}`);
      continue;
    }

    const stat = statSync(resolved);

    if (stat.isFile() && (resolved.endsWith('.jsonl') || resolved.endsWith('.json'))) {
      files.push(resolved);
    } else if (stat.isDirectory()) {
      const dirFiles = readdirSync(resolved)
        .filter((f) => f.endsWith('.jsonl') || f.endsWith('.json'))
        .map((f) => join(resolved, f));
      files.push(...dirFiles);
    }
  }

  return files;
}

function generateCSV(results: EvalResult[]): string {
  const headers = ['file', 'trajectory_id', 'overall_score', 'cost', 'passed', 'error'];
  const rows = results.map((r) => [
    r.file || '',
    r.trajectory_id,
    r.overall_score.toFixed(3),
    r.cost?.toFixed(4) || '',
    r.passed ? 'true' : 'false',
    r.error || '',
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
