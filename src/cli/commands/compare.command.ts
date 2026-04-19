import { readFileSync } from 'fs';
import { RunComparator } from '../../suite/comparator.js';
import type { AggregatedResults } from '../../suite/results.js';
import type { RunComparisonResult } from '../../suite/comparator.js';
import { cliOut, cliError } from '../output.js';

export interface CompareOptions {
  statistical?: boolean;
  format?: string;
  verbose?: boolean;
}

export async function compareCommand(
  baselinePath: string,
  candidatePath: string,
  options: CompareOptions,
): Promise<void> {
  const { format = 'json' } = options;

  try {
    const baselineData = JSON.parse(readFileSync(baselinePath, 'utf-8')) as AggregatedResults;
    const candidateData = JSON.parse(readFileSync(candidatePath, 'utf-8')) as AggregatedResults;

    const comparator = new RunComparator();
    const comparison: RunComparisonResult = comparator.compare(baselineData, candidateData);

    if (format === 'json') {
      cliOut(JSON.stringify(comparison, null, 2));
    } else if (format === 'markdown') {
      cliOut(generateMarkdownReport(comparison));
    } else if (format === 'table') {
      cliOut(generateTableReport(comparison));
    }

    cliOut('\n=== Comparison Summary ===');
    cliOut(`Baseline: ${baselinePath}`);
    cliOut(`Candidate: ${candidatePath}`);
    cliOut(
      `Score Diff: ${comparison.scoreDiff > 0 ? '+' : ''}${(comparison.scoreDiff * 100).toFixed(1)}%`,
    );
    cliOut(`Regressions: ${comparison.regressions.length}`);
    cliOut(`Improvements: ${comparison.improvements.length}`);

    if (comparison.regressions.length > 0) {
      cliOut('\nRegressions:');
      for (const reg of comparison.regressions) {
        cliOut(
          `  - ${reg.metric}: ${reg.baseline.toFixed(3)} → ${reg.candidate.toFixed(3)} (${reg.decline.toFixed(3)})`,
        );
      }
    }

    if (comparison.improvements.length > 0) {
      cliOut('\nImprovements:');
      for (const imp of comparison.improvements) {
        cliOut(
          `  + ${imp.metric}: ${imp.baseline.toFixed(3)} → ${imp.candidate.toFixed(3)} (+${imp.gain.toFixed(3)})`,
        );
      }
    }

    cliOut(`\nVerdict: ${comparison.summary.verdict}`);
    cliOut(`Recommendation: ${comparison.summary.recommendation}`);

    if (comparison.regressions.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    cliError('Comparison failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function generateMarkdownReport(comparison: RunComparisonResult): string {
  let md = '# Evaluation Comparison Report\n\n';

  md += `## Summary\n\n`;
  md += `- **Score Difference**: ${(comparison.scoreDiff * 100).toFixed(1)}%\n`;
  md += `- **Regressions**: ${comparison.regressions.length}\n`;
  md += `- **Improvements**: ${comparison.improvements.length}\n\n`;

  if (comparison.regressions.length > 0) {
    md += `## Regressions\n\n`;
    md += `| Metric | Baseline | Candidate | Change |\n`;
    md += `|--------|----------|-----------|--------|\n`;
    for (const reg of comparison.regressions) {
      md += `| ${reg.metric} | ${reg.baseline.toFixed(3)} | ${reg.candidate.toFixed(3)} | -${(reg.decline * 100).toFixed(1)}% |\n`;
    }
    md += '\n';
  }

  if (comparison.improvements.length > 0) {
    md += `## Improvements\n\n`;
    md += `| Metric | Baseline | Candidate | Change |\n`;
    md += `|--------|----------|-----------|--------|\n`;
    for (const imp of comparison.improvements) {
      md += `| ${imp.metric} | ${imp.baseline.toFixed(3)} | ${imp.candidate.toFixed(3)} | +${(imp.gain * 100).toFixed(1)}% |\n`;
    }
    md += '\n';
  }

  return md;
}

function generateTableReport(comparison: RunComparisonResult): string {
  let table = '=== Comparison Results ===\n\n';

  table += `Score Diff: ${(comparison.scoreDiff * 100).toFixed(1)}%\n`;
  table += `Regressions: ${comparison.regressions.length}\n`;
  table += `Improvements: ${comparison.improvements.length}\n\n`;

  if (comparison.regressions.length > 0) {
    table += 'Regressions:\n';
    for (const reg of comparison.regressions) {
      table += `  ${reg.metric}: ${reg.baseline.toFixed(3)} → ${reg.candidate.toFixed(3)} (-${reg.decline.toFixed(3)})\n`;
    }
  }

  if (comparison.improvements.length > 0) {
    table += '\nImprovements:\n';
    for (const imp of comparison.improvements) {
      table += `  ${imp.metric}: ${imp.baseline.toFixed(3)} → ${imp.candidate.toFixed(3)} (+${imp.gain.toFixed(3)})\n`;
    }
  }

  return table;
}
