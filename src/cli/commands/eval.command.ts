import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { loadFromFile } from '../../trajectory/loader.js';
import { evaluate } from '../../trajectory/evaluator.js';
import { compare as compareTrajectory } from '../../trajectory/comparator.js';
import { validateTrajectory } from '../../tool-use/validator.js';
import { calculateTrajectoryCost } from '../../cost/tracker.js';
import { loadGoldenTrajectories } from '../../golden/manager.js';
import type { EvalResult, Trajectory } from '../../types/domain.js';
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

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const avgQuality =
    results.length > 0 ? results.reduce((sum, r) => sum + r.overall_score, 0) / results.length : 0;
  const avgCost = results.length > 0 ? totalCost / results.length : 0;
  const passRate = results.length > 0 ? (passedCount / results.length) * 100 : 0;

  mkdirSync(output, { recursive: true });

  const resultsFile = join(output, `results.${format}`);
  const outputData = {
    run_id: `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    trajectory_count: results.length,
    overall_score: avgQuality,
    total_cost: totalCost,
    avg_cost: avgCost,
    passed: passedCount,
    failed: failedCount,
    pass_rate: passRate,
    results,
  };

  if (format === 'json') {
    writeFileSync(resultsFile, JSON.stringify(outputData, null, 2));
  } else if (format === 'csv') {
    writeFileSync(resultsFile, generateCSV(results));
  }

  cliOut('\n=== Evaluation Summary ===');
  cliOut(`Trajectories: ${results.length}`);
  cliOut(`Passed: ${passedCount}`);
  cliOut(`Failed: ${failedCount}`);
  cliOut(`Pass Rate: ${outputData.pass_rate.toFixed(1)}%`);
  cliOut(`Average Quality: ${avgQuality.toFixed(3)}`);
  cliOut(`Average Cost: $${avgCost.toFixed(4)}`);
  cliOut(`Total Cost: $${totalCost.toFixed(4)}`);
  cliOut(`Results saved to: ${resultsFile}`);
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
