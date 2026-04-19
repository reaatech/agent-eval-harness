import { readFileSync } from 'fs';
import { createGateEngine } from '../../gate/engine.js';
import type { GateDefinition, GateEvaluationSummary } from '../../gate/engine.js';
import {
  getStandardPreset,
  getStrictPreset,
  getLenientPreset,
} from '../../gate/threshold-gates.js';
import { CIIntegration, outputGitHubAnnotations } from '../../gate/ci-integration.js';
import type { AggregatedResults } from '../../suite/results.js';
import { cliOut, cliError } from '../output.js';

export interface GateOptions {
  gates?: string;
  preset?: string;
  exitCode?: boolean;
  verbose?: boolean;
}

export async function gateCommand(resultsPath: string, options: GateOptions): Promise<void> {
  const { preset = 'standard', exitCode = true, verbose = false } = options;

  try {
    const resultsData = JSON.parse(readFileSync(resultsPath, 'utf-8'));

    const gateDefinitions: GateDefinition[] = getGatePreset(preset).gates;
    const engine = createGateEngine(gateDefinitions);
    const summary: GateEvaluationSummary = engine.evaluate(resultsData as AggregatedResults);

    if (exitCode) {
      outputGitHubAnnotations(summary);
    }

    cliOut('\n=== Gate Evaluation Results ===');
    cliOut(`Overall: ${summary.overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
    cliOut(`Total Gates: ${summary.totalGates}`);
    cliOut(`Passed: ${summary.passedGates}`);
    cliOut(`Failed: ${summary.failedGates}`);
    cliOut(`Duration: ${summary.durationMs}ms`);

    cliOut('\nGate Details:');
    for (const result of summary.results) {
      const status = result.passed ? '✅' : '❌';
      cliOut(`  ${status} ${result.name}: ${result.reason || 'OK'}`);
      if (verbose) {
        cliOut(
          `     Value: ${result.actualValue?.toFixed(3)}, Threshold: ${result.expectedValue?.toFixed(3)}`,
        );
      }
    }

    const junitXml = CIIntegration.generateJUnitReport(summary);
    cliOut('\nJUnit Report:');
    cliOut(junitXml);

    if (exitCode) {
      const comment = CIIntegration.generatePRComment(summary);
      cliOut('\nPR Comment:');
      cliOut(comment);
    }

    if (!summary.overallPassed && exitCode) {
      process.exit(1);
    }
  } catch (error) {
    cliError('Gate evaluation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function getGatePreset(preset: string): { gates: GateDefinition[] } {
  switch (preset) {
    case 'strict':
      return getStrictPreset();
    case 'lenient':
      return getLenientPreset();
    case 'standard':
    default:
      return getStandardPreset();
  }
}
