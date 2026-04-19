import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AggregatedResults } from '../../suite/results.js';
import { cliOut, cliError, cliWarn } from '../output.js';

export interface ReportOptions {
  format?: string;
  output?: string;
  template?: string;
  includeRaw?: boolean;
  verbose?: boolean;
}

export async function reportCommand(resultsPath: string, options: ReportOptions): Promise<void> {
  const { format = 'markdown', output, includeRaw = false } = options;

  try {
    const resultsData: AggregatedResults = JSON.parse(readFileSync(resultsPath, 'utf-8'));

    let report: string;

    switch (format) {
      case 'html':
        report = generateHTMLReport(resultsData, includeRaw);
        break;
      case 'json':
        report = JSON.stringify(resultsData, null, 2);
        break;
      case 'pdf':
        cliWarn('PDF generation requires additional setup. Generating markdown instead.');
        report = generateMarkdownReport(resultsData, includeRaw);
        break;
      case 'markdown':
      default:
        report = generateMarkdownReport(resultsData, includeRaw);
        break;
    }

    if (output) {
      mkdirSync(join(output, '..'), { recursive: true });
      writeFileSync(output, report);
      cliOut(`Report saved to: ${output}`);
    } else {
      cliOut(report);
    }
  } catch (error) {
    cliError('Report generation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function generateMarkdownReport(results: AggregatedResults, includeRaw: boolean): string {
  let md = '# Agent Evaluation Report\n\n';

  md += `**Run ID:** ${results.runId}\n`;
  md += `**Generated:** ${results.timestamp}\n`;
  md += `**Trajectories:** ${results.summary.totalTrajectories}\n\n`;

  md += '## Overall Metrics\n\n';
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Overall Score | ${(results.overallMetrics.overallScore * 100).toFixed(1)}% |\n`;
  md += `| Avg Cost per Task | $${results.overallMetrics.avgCostPerTask.toFixed(4)} |\n`;
  md += `| P99 Latency | ${results.overallMetrics.latencyP99.toFixed(0)}ms |\n\n`;

  md += '## Summary\n\n';
  md += `| Statistic | Value |\n`;
  md += `|-----------|-------|\n`;
  md += `| Total Trajectories | ${results.summary.totalTrajectories} |\n`;
  md += `| Passed | ${results.summary.passedTrajectories} |\n`;
  md += `| Failed | ${results.summary.failedTrajectories} |\n`;
  md += `| Pass Rate | ${results.summary.passRate.toFixed(1)}% |\n\n`;

  md += '## Metric Breakdown\n\n';

  for (const [key, breakdown] of Object.entries(results.metricBreakdown)) {
    md += `### ${key}\n\n`;
    md += `- Average: ${(breakdown.avgScore * 100).toFixed(1)}%\n`;
    md += `- Min: ${(breakdown.minScore * 100).toFixed(1)}%\n`;
    md += `- Max: ${(breakdown.maxScore * 100).toFixed(1)}%\n`;
    md += `- Std Dev: ${breakdown.stdDev.toFixed(3)}\n\n`;
  }

  if (includeRaw && results.trajectoryResults) {
    md += '## Raw Results\n\n';
    for (const result of results.trajectoryResults) {
      md += `### ${result.trajectoryId}\n\n`;
      md += `- Overall Score: ${(result.overallScore * 100).toFixed(1)}%\n`;
      md += `- Passed: ${result.passed ? 'Yes' : 'No'}\n`;
      if (result.errors) {
        md += `- Error: ${result.errors}\n`;
      }
      md += '\n';
    }
  }

  return md;
}

function generateHTMLReport(results: AggregatedResults, includeRaw: boolean): string {
  const markdown = generateMarkdownReport(results, includeRaw);

  const html = markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\| (.*?) \|/g, '<td>$1</td>')
    .replace(/<td>(.*?)<\/td>/g, '<tr><td>$1</td></tr>')
    .replace(/<tr>(.*?)<\/tr>/g, '<table>$1</table>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Agent Evaluation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    td, th { border: 1px solid #ddd; padding: 8px; }
    th { background-color: #f5f5f5; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
    code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}
