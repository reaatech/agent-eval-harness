import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CIIntegration,
  exportForCI,
  outputGitHubAnnotations,
  setGitHubOutput,
  writeJUnitReport,
} from '@reaatech/agent-eval-harness-gate';
import type { GateEvaluationSummary } from '@reaatech/agent-eval-harness-gate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function makeSummary(overrides?: Partial<GateEvaluationSummary>): GateEvaluationSummary {
  return {
    runId: 'test-run-001',
    totalGates: 2,
    passedGates: 2,
    failedGates: 0,
    overallPassed: true,
    results: [
      {
        name: 'quality',
        passed: true,
        reason: 'overall_score (0.850) >= 0.8',
        actualValue: 0.85,
        expectedValue: 0.8,
        type: 'threshold' as const,
      },
      {
        name: 'cost',
        passed: true,
        reason: 'cost (0.030) <= 0.05',
        actualValue: 0.03,
        expectedValue: 0.05,
        type: 'threshold' as const,
      },
    ],
    durationMs: 100,
    ...overrides,
  };
}

describe('CIIntegration', () => {
  describe('getExitCode', () => {
    it('should return 0 for passed gates', () => {
      expect(CIIntegration.getExitCode(makeSummary())).toBe(0);
    });

    it('should return 1 for failed gates', () => {
      expect(
        CIIntegration.getExitCode(
          makeSummary({
            overallPassed: false,
            passedGates: 1,
            failedGates: 1,
            results: [
              {
                name: 'quality',
                passed: false,
                reason: 'failed',
                actualValue: 0.7,
                expectedValue: 0.8,
                type: 'threshold',
              },
            ],
          }),
        ),
      ).toBe(1);
    });
  });

  describe('generateGitHubAnnotations', () => {
    it('should generate notice for passed gates', () => {
      const output = CIIntegration.generateGitHubAnnotations(makeSummary());
      expect(output).toContain('::notice');
      expect(output).toContain('quality');
    });

    it('should generate error for failed gates', () => {
      const output = CIIntegration.generateGitHubAnnotations(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'failed',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(output).toContain('::error');
      expect(output).toContain('quality');
    });
  });

  describe('generateJUnitReport', () => {
    it('should generate valid JUnit XML', () => {
      const xml = CIIntegration.generateJUnitReport(makeSummary());
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<testsuite');
      expect(xml).toContain('<testcase');
      expect(xml).toContain('name="quality"');
    });

    it('should include failure element for failed gates', () => {
      const xml = CIIntegration.generateJUnitReport(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'Score too low',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(xml).toContain('<failure');
      expect(xml).toContain('Score too low');
    });
  });

  describe('generatePRComment', () => {
    it('should generate markdown table with results', () => {
      const comment = CIIntegration.generatePRComment(makeSummary());
      expect(comment).toContain('## ✅ Evaluation Gates');
      expect(comment).toContain('quality');
      expect(comment).toContain('| Gate | Status | Details |');
    });

    it('should show failed status when gates fail', () => {
      const comment = CIIntegration.generatePRComment(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'Score too low',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(comment).toContain('## ❌ Evaluation Gates');
    });
  });

  describe('generateStepSummary', () => {
    it('should generate step summary markdown', () => {
      const summary = CIIntegration.generateStepSummary(makeSummary());
      expect(summary).toContain('### Gate Evaluation Results');
      expect(summary).toContain('✅ Passed');
      expect(summary).toContain('quality');
    });
  });

  describe('generateEnvVars', () => {
    it('should generate environment variables', () => {
      const env = CIIntegration.generateEnvVars(makeSummary());
      expect(env.EVAL_GATE_PASSED).toBe('true');
      expect(env.EVAL_GATE_TOTAL).toBe('2');
      expect(env.EVAL_GATE_PASSED_COUNT).toBe('2');
      expect(env.EVAL_GATE_FAILED_COUNT).toBe('0');
      expect(env.EVAL_GATE_DURATION_MS).toBe('100');
      expect(env.EVAL_GATE_FAILURES).toBe('[]');
    });

    it('should list failed gate names', () => {
      const env = CIIntegration.generateEnvVars(
        makeSummary({
          overallPassed: false,
          passedGates: 1,
          failedGates: 1,
          results: [
            {
              name: 'quality',
              passed: false,
              reason: 'Failed',
              actualValue: 0.7,
              expectedValue: 0.8,
              type: 'threshold',
            },
          ],
        }),
      );
      expect(env.EVAL_GATE_PASSED).toBe('false');
      expect(env.EVAL_GATE_FAILURES).toContain('quality');
    });
  });

  describe('parseGateConfig', () => {
    it('should parse YAML gate configuration', () => {
      const yaml = `
- name: quality
  type: threshold
  metric: overall_score
  threshold: 0.8
- name: cost
  type: threshold
  metric: cost
  threshold: 0.05
`;
      const gates = CIIntegration.parseGateConfig(yaml);
      expect(gates).toHaveLength(2);
      expect(gates[0]?.name).toBe('quality');
      expect(gates[1]?.name).toBe('cost');
    });

    it('should ignore comments and blank lines', () => {
      const yaml = `# This is a comment
- name: test
  type: threshold
  metric: overall_score
`;
      const gates = CIIntegration.parseGateConfig(yaml);
      expect(gates).toHaveLength(1);
    });
  });
});

describe('CI integration standalone functions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-ci-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('outputGitHubAnnotations', () => {
    it('should write annotations to stdout', () => {
      // eslint-disable-next-line no-console
      const originalLog = console.log;
      let logged = '';
      // eslint-disable-next-line no-console
      console.log = (msg: string): void => {
        logged += msg;
      };
      try {
        outputGitHubAnnotations(makeSummary());
        expect(logged).toContain('::notice');
      } finally {
        // eslint-disable-next-line no-console
        console.log = originalLog;
      }
    });
  });

  describe('setGitHubOutput', () => {
    it('should append key=value to the $GITHUB_OUTPUT file', () => {
      const outputFile = path.join(tmpDir, 'gh-output');
      fs.writeFileSync(outputFile, '');
      process.env.GITHUB_OUTPUT = outputFile;
      try {
        setGitHubOutput('mykey', 'myval');
        setGitHubOutput('other', 'value2');
        const content = fs.readFileSync(outputFile, 'utf-8');
        expect(content).toContain('mykey=myval');
        expect(content).toContain('other=value2');
      } finally {
        process.env.GITHUB_OUTPUT = undefined;
      }
    });

    it('should be a no-op when GITHUB_OUTPUT is not set', () => {
      process.env.GITHUB_OUTPUT = undefined;
      // Simply verify it does not throw
      expect(() => setGitHubOutput('mykey', 'myval')).not.toThrow();
    });
  });

  describe('exportForCI', () => {
    it('should write junit.xml, results.json, and pr-comment.md', async () => {
      await exportForCI(makeSummary(), tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'junit.xml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'results.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'pr-comment.md'))).toBe(true);

      const junit = fs.readFileSync(path.join(tmpDir, 'junit.xml'), 'utf-8');
      expect(junit).toContain('<?xml');

      const json = fs.readFileSync(path.join(tmpDir, 'results.json'), 'utf-8');
      expect(JSON.parse(json).runId).toBe('test-run-001');

      const comment = fs.readFileSync(path.join(tmpDir, 'pr-comment.md'), 'utf-8');
      expect(comment).toContain('Evaluation Gates');
    });
  });

  describe('writeJUnitReport', () => {
    it('should write JUnit XML to file', async () => {
      const filePath = path.join(tmpDir, 'junit-standalone.xml');
      await writeJUnitReport(makeSummary(), filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('<?xml');
      expect(content).toContain('<testsuite');
    });
  });
});
