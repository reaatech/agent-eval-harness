import { appendFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { GateEvaluationSummary } from './engine.js';

/**
 * GitHub Actions annotation
 */
export interface GitHubAnnotation {
  type: 'error' | 'warning' | 'notice';
  file?: string;
  line?: number;
  col?: number;
  title?: string;
  message: string;
}

/**
 * JUnit test case
 */
export interface JUnitTestCase {
  name: string;
  classname: string;
  time: number;
  failure?: {
    message: string;
    type?: string;
    details: string;
  };
}

/**
 * CI Integration utilities
 */
// biome-ignore lint/complexity/noStaticOnlyClass: public API surface; refactoring to free functions would be a breaking change.
export class CIIntegration {
  /**
   * Generate GitHub Actions workflow commands
   */
  static generateGitHubAnnotations(summary: GateEvaluationSummary): string {
    const lines: string[] = [];

    // Summary notice
    const status = summary.overallPassed ? 'notice' : 'error';
    lines.push(
      `::${status}::Gate evaluation: ${summary.passedGates}/${summary.totalGates} passed (${summary.durationMs}ms)`,
    );

    // Individual gate results
    for (const result of summary.results) {
      if (!result.passed) {
        lines.push(`::error title=Gate Failed::${result.name}: ${result.reason}`);
      } else {
        lines.push(`::notice title=Gate Passed::${result.name}: ${result.reason}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate JUnit XML report
   */
  static generateJUnitReport(summary: GateEvaluationSummary): string {
    const testCases: JUnitTestCase[] = summary.results.map((result) => {
      const tc: JUnitTestCase = {
        name: result.name,
        classname: 'gate',
        time: summary.durationMs / 1000,
      };
      if (!result.passed) {
        tc.failure = {
          message: result.reason,
          type: 'GateFailure',
          details: `Expected: ${result.expectedValue}, Actual: ${result.actualValue}`,
        };
      }
      return tc;
    });

    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuite name="eval-gates" tests="${summary.totalGates}" failures="${summary.failedGates}" errors="0" time="${(summary.durationMs / 1000).toFixed(3)}">`,
    ];

    for (const tc of testCases) {
      lines.push(
        `  <testcase name="${tc.name}" classname="${tc.classname}" time="${tc.time.toFixed(3)}">`,
      );
      if (tc.failure) {
        lines.push(
          `    <failure message="${tc.failure.message}" type="${tc.failure.type}">${tc.failure.details}</failure>`,
        );
      }
      lines.push('  </testcase>');
    }

    lines.push('</testsuite>');
    return lines.join('\n');
  }

  /**
   * Generate PR comment body
   */
  static generatePRComment(summary: GateEvaluationSummary): string {
    const status = summary.overallPassed ? '✅' : '❌';
    const lines: string[] = [
      `## ${status} Evaluation Gates`,
      '',
      `**Overall:** ${summary.overallPassed ? 'All gates passed' : `${summary.failedGates} gate(s) failed`}`,
      '',
      '| Gate | Status | Details |',
      '|------|--------|---------|',
    ];

    for (const result of summary.results) {
      const icon = result.passed ? '✅' : '❌';
      lines.push(`| ${result.name} | ${icon} | ${result.reason} |`);
    }

    lines.push('');
    lines.push(`*Duration: ${summary.durationMs}ms*`);

    return lines.join('\n');
  }

  /**
   * Get exit code for CI
   */
  static getExitCode(summary: GateEvaluationSummary): number {
    return summary.overallPassed ? 0 : 1;
  }

  /**
   * Generate summary for GitHub Actions step summary
   */
  static generateStepSummary(summary: GateEvaluationSummary): string {
    const lines: string[] = [
      '### Gate Evaluation Results',
      '',
      `**Status:** ${summary.overallPassed ? '✅ Passed' : '❌ Failed'}`,
      `**Passed:** ${summary.passedGates}/${summary.totalGates}`,
      `**Duration:** ${summary.durationMs}ms`,
      '',
      '#### Details',
      '',
    ];

    for (const result of summary.results) {
      const icon = result.passed ? '✅' : '❌';
      lines.push(`${icon} **${result.name}**: ${result.reason}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate environment variables for CI
   */
  static generateEnvVars(summary: GateEvaluationSummary): Record<string, string> {
    return {
      EVAL_GATE_PASSED: summary.overallPassed ? 'true' : 'false',
      EVAL_GATE_TOTAL: summary.totalGates.toString(),
      EVAL_GATE_PASSED_COUNT: summary.passedGates.toString(),
      EVAL_GATE_FAILED_COUNT: summary.failedGates.toString(),
      EVAL_GATE_DURATION_MS: summary.durationMs.toString(),
      EVAL_GATE_FAILURES: JSON.stringify(
        summary.results.filter((r) => !r.passed).map((r) => r.name),
      ),
    };
  }

  /**
   * Parse gate configuration from YAML string
   */
  static parseGateConfig(
    yamlString: string,
  ): Array<{ name: string; type: string; [key: string]: unknown }> {
    const parsed = parseYaml(yamlString);
    if (Array.isArray(parsed)) {
      return parsed as Array<{ name: string; type: string; [key: string]: unknown }>;
    }
    const obj = parsed as { gates?: Array<{ name: string; type: string; [key: string]: unknown }> };
    return obj?.gates ?? [];
  }
}

/**
 * Write JUnit report to file (Node.js)
 */
export async function writeJUnitReport(
  summary: GateEvaluationSummary,
  filePath: string,
): Promise<void> {
  const xml = CIIntegration.generateJUnitReport(summary);
  await import('node:fs/promises').then((fs) => fs.writeFile(filePath, xml, 'utf-8'));
}

/**
 * Write GitHub Actions annotations to stdout
 */
export function outputGitHubAnnotations(summary: GateEvaluationSummary): void {
  // eslint-disable-next-line no-console
  console.log(CIIntegration.generateGitHubAnnotations(summary));
}

/**
 * Set GitHub Actions output by appending to $GITHUB_OUTPUT file.
 * See: https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-output-parameter
 */
export function setGitHubOutput(key: string, value: string): void {
  const gOutput = process.env.GITHUB_OUTPUT;
  if (!gOutput) return;
  appendFileSync(gOutput, `${key}=${value}\n`, 'utf-8');
}

/**
 * Export results for CI
 */
export async function exportForCI(
  summary: GateEvaluationSummary,
  outputDir: string,
): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.mkdir(outputDir, { recursive: true });

  // Write JUnit report
  await fs.writeFile(`${outputDir}/junit.xml`, CIIntegration.generateJUnitReport(summary), 'utf-8');

  // Write JSON results
  await fs.writeFile(`${outputDir}/results.json`, JSON.stringify(summary, null, 2), 'utf-8');

  // Write PR comment
  await fs.writeFile(
    `${outputDir}/pr-comment.md`,
    CIIntegration.generatePRComment(summary),
    'utf-8',
  );
}
