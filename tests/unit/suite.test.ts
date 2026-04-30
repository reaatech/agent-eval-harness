import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunComparator, createRunComparator } from '../../src/suite/comparator.js';
import {
  DEFAULT_METRICS,
  calculateOverallScore,
  checkThresholds,
  createDefaultConfig,
  getEnabledMetrics,
  mergeConfig,
  parseConfig,
  validateConfig,
} from '../../src/suite/config.js';
import type { MetricConfig, SuiteConfig } from '../../src/suite/config.js';
import { ResultsAggregator, createResultsAggregator } from '../../src/suite/results.js';
import type { AggregatedResults, ExportFormat } from '../../src/suite/results.js';
import { SuiteRunner, createSuiteRunner } from '../../src/suite/runner.js';
import type { EvalRunResult, OverallMetrics, ProgressUpdate } from '../../src/suite/runner.js';
import type { EvalResult, Trajectory } from '../../src/types/domain.js';

function makeSuiteConfig(overrides?: Partial<SuiteConfig>): SuiteConfig {
  return {
    name: 'test-suite',
    description: 'Test suite description',
    metrics: [
      { name: 'faithfulness', enabled: true, weight: 0.3, threshold: 0.8 },
      { name: 'relevance', enabled: true, weight: 0.3, threshold: 0.8 },
      { name: 'tool_correctness', enabled: true, weight: 0.2, threshold: 0.9 },
      { name: 'cost', enabled: true, weight: 0.1 },
      { name: 'latency', enabled: true, weight: 0.1 },
    ],
    ...overrides,
  };
}

function makeTrajectory(id: string): Trajectory {
  return {
    trajectory_id: id,
    turns: [
      { turn_id: 1, role: 'user' as const, content: 'hello', timestamp: '2026-04-15T23:00:00Z' },
      { turn_id: 1, role: 'agent' as const, content: 'hi', timestamp: '2026-04-15T23:00:01Z' },
    ],
  };
}

function makeEvalResult(overrides: Record<string, unknown> = {}): EvalResult {
  return {
    trajectory_id: 'traj-1',
    overall_score: 0.85,
    metrics: {
      faithfulness: 0.9,
      relevance: 0.85,
      tool_correctness: 0.95,
      cost_score: 0.97,
      latency_score: 0.88,
    },
    cost: 0.03,
    ...overrides,
  };
}

function makeOverallMetrics(overrides?: Partial<OverallMetrics>): OverallMetrics {
  return {
    overallScore: 0.85,
    avgFaithfulness: 0.88,
    avgRelevance: 0.82,
    toolCorrectnessRate: 0.95,
    avgCostPerTask: 0.03,
    latencyP50: 800,
    latencyP90: 1200,
    latencyP99: 2500,
    slaViolations: 0,
    ...overrides,
  };
}

function makeEvalRunResult(overrides?: Partial<EvalRunResult>): EvalRunResult {
  return {
    runId: 'eval-test-001',
    status: 'completed',
    startedAt: '2026-04-15T23:00:00Z',
    endedAt: '2026-04-15T23:01:00Z',
    totalTrajectories: 3,
    completedTrajectories: 3,
    failedTrajectories: 0,
    trajectoryResults: [],
    overallMetrics: makeOverallMetrics(),
    durationMs: 60000,
    ...overrides,
  };
}

function makeAggregatedResults(overrides?: Partial<AggregatedResults>): AggregatedResults {
  return {
    runId: 'run-001',
    config: makeSuiteConfig(),
    overallMetrics: makeOverallMetrics(),
    metricBreakdown: {
      faithfulness: {
        name: 'faithfulness',
        avgScore: 0.88,
        minScore: 0.8,
        maxScore: 0.95,
        stdDev: 0.05,
        passRate: 1,
        weight: 0.3,
      },
      relevance: {
        name: 'relevance',
        avgScore: 0.82,
        minScore: 0.75,
        maxScore: 0.9,
        stdDev: 0.06,
        passRate: 0.9,
        weight: 0.3,
      },
    },
    trajectoryResults: [],
    summary: {
      totalTrajectories: 3,
      passedTrajectories: 3,
      failedTrajectories: 0,
      passRate: 100,
      overallPassed: true,
      durationMs: 60000,
    },
    timestamp: '2026-04-15T23:01:00Z',
    ...overrides,
  };
}

describe('config', () => {
  describe('DEFAULT_METRICS', () => {
    it('contains 5 default metrics', () => {
      expect(DEFAULT_METRICS).toHaveLength(5);
    });

    it('has expected metric names', () => {
      const names = DEFAULT_METRICS.map((m) => m.name);
      expect(names).toEqual(['faithfulness', 'relevance', 'tool_correctness', 'cost', 'latency']);
    });

    it('all default metrics are enabled', () => {
      expect(DEFAULT_METRICS.every((m) => m.enabled)).toBe(true);
    });

    it('default metric weights sum to 1.0', () => {
      const totalWeight = DEFAULT_METRICS.reduce((sum, m) => sum + m.weight, 0);
      expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);
    });

    it('each metric has a threshold', () => {
      for (const m of DEFAULT_METRICS) {
        expect(m.threshold).toBeDefined();
      }
    });
  });

  describe('parseConfig', () => {
    it('parses a simple key-value YAML config', () => {
      const yaml = 'name: my-suite\n';
      const config = parseConfig(yaml);
      expect(config.name).toBe('my-suite');
    });

    it('parses boolean values', () => {
      const yaml = 'name: test\nflag: true\nother: false\n';
      const config = parseConfig(yaml);
      expect(config.name).toBe('test');
      expect(config).toHaveProperty('flag', true);
      expect(config).toHaveProperty('other', false);
    });

    it('parses numeric values', () => {
      const yaml = 'name: test\ncount: 42\nratio: 0.85\n';
      const config = parseConfig(yaml);
      expect(config).toHaveProperty('count', 42);
      expect(config).toHaveProperty('ratio', 0.85);
    });

    it('parses list values', () => {
      const yaml = 'metrics:\n  - faithfulness\n  - relevance\n';
      const config = parseConfig(yaml);
      expect(config).toHaveProperty('metrics');
      expect((config as unknown as Record<string, unknown>).metrics).toEqual([
        'faithfulness',
        'relevance',
      ]);
    });

    it('parses list of objects', () => {
      const yaml = 'metrics:\n  - name: faithfulness\n  - name: relevance\n';
      const config = parseConfig(yaml);
      expect((config as unknown as Record<string, unknown>).metrics).toEqual([
        { name: 'faithfulness' },
        { name: 'relevance' },
      ]);
    });

    it('ignores comment lines', () => {
      const yaml = '# This is a comment\nname: test\n# Another comment\n';
      const config = parseConfig(yaml);
      expect(config.name).toBe('test');
    });

    it('ignores blank lines', () => {
      const yaml = '\nname: test\n\n';
      const config = parseConfig(yaml);
      expect(config.name).toBe('test');
    });

    it('parses nested key-value pairs under a section', () => {
      const yaml = 'judge:\n  model: claude\n  provider: anthropic\n';
      const config = parseConfig(yaml);
      expect((config as unknown as Record<string, unknown>).judge).toEqual({
        model: 'claude',
        provider: 'anthropic',
      });
    });

    it('returns empty config for empty string', () => {
      const config = parseConfig('');
      expect(Object.keys(config)).toHaveLength(0);
    });

    it('parses null values', () => {
      const yaml = 'name: test\nvalue: null\n';
      const config = parseConfig(yaml);
      expect((config as unknown as Record<string, unknown>).value).toBeNull();
    });
  });

  describe('validateConfig', () => {
    it('returns valid for a correct config', () => {
      const config = makeSuiteConfig();
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error when name is missing', () => {
      const config = makeSuiteConfig({ name: '' });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Suite name is required');
    });

    it('returns error when metrics array is empty', () => {
      const config = makeSuiteConfig({ metrics: [] });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one metric is required');
    });

    it('returns error when metrics is undefined', () => {
      const config = makeSuiteConfig({ metrics: undefined as unknown as MetricConfig[] });
      expect(() => validateConfig(config)).toThrow();
    });

    it('returns error when enabled weights do not sum to 1.0', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.5 },
          { name: 'b', enabled: true, weight: 0.3 },
        ],
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('weights must sum to 1.0'))).toBe(true);
    });

    it('accepts weights that sum to approximately 1.0', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.33 },
          { name: 'b', enabled: true, weight: 0.33 },
          { name: 'c', enabled: true, weight: 0.34 },
        ],
      });
      const result = validateConfig(config);
      expect(result.errors.some((e) => e.includes('weights must sum to 1.0'))).toBe(false);
    });

    it('ignores disabled metrics in weight sum', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 1.0 },
          { name: 'b', enabled: false, weight: 2.0 },
        ],
      });
      const result = validateConfig(config);
      expect(result.errors.some((e) => e.includes('weights must sum to 1.0'))).toBe(false);
    });

    it('returns error for threshold outside 0-1 range', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'faithfulness', enabled: true, weight: 1.0, threshold: 1.5 }],
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must be between 0 and 1'))).toBe(true);
    });

    it('returns error for negative threshold', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'faithfulness', enabled: true, weight: 1.0, threshold: -0.1 }],
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must be between 0 and 1'))).toBe(true);
    });

    it('accepts threshold of 0', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0, threshold: 0 }],
      });
      const result = validateConfig(config);
      expect(result.errors.some((e) => e.includes('must be between 0 and 1'))).toBe(false);
    });

    it('accepts threshold of 1', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0, threshold: 1 }],
      });
      const result = validateConfig(config);
      expect(result.errors.some((e) => e.includes('must be between 0 and 1'))).toBe(false);
    });

    it('does not validate threshold for disabled metrics', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: false, weight: 0.0, threshold: 5 },
          { name: 'b', enabled: true, weight: 1.0, threshold: 0.5 },
        ],
      });
      const result = validateConfig(config);
      expect(result.errors.some((e) => e.includes('must be between 0 and 1'))).toBe(false);
    });

    it('does not error on metrics without thresholds', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0 }],
      });
      const result = validateConfig(config);
      expect(result.errors.some((e) => e.includes('threshold'))).toBe(false);
    });

    it('collects multiple errors', () => {
      const config = makeSuiteConfig({ name: '', metrics: [] });
      const result = validateConfig(config);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createDefaultConfig', () => {
    it('creates config with given name', () => {
      const config = createDefaultConfig('my-suite');
      expect(config.name).toBe('my-suite');
    });

    it('creates description from name', () => {
      const config = createDefaultConfig('my-suite');
      expect(config.description).toBe('Evaluation suite: my-suite');
    });

    it('copies default metrics', () => {
      const config = createDefaultConfig('test');
      expect(config.metrics).toEqual(DEFAULT_METRICS);
      expect(config.metrics).not.toBe(DEFAULT_METRICS);
    });

    it('sets default output config', () => {
      const config = createDefaultConfig('test');
      expect(config.output).toEqual({
        formats: ['json'],
        directory: './results',
        includeDetails: true,
      });
    });
  });

  describe('mergeConfig', () => {
    it('merges partial config with defaults', () => {
      const config = mergeConfig({ name: 'custom' });
      expect(config.name).toBe('custom');
      expect(config.metrics).toHaveLength(5);
    });

    it('uses default name when not provided', () => {
      const config = mergeConfig({});
      expect(config.name).toBe('default');
    });

    it('overrides metrics when provided', () => {
      const customMetrics: MetricConfig[] = [{ name: 'custom', enabled: true, weight: 1.0 }];
      const config = mergeConfig({ name: 'test', metrics: customMetrics });
      expect(config.metrics).toEqual(customMetrics);
    });

    it('overrides output when provided', () => {
      const config = mergeConfig({
        name: 'test',
        output: { formats: ['csv'], directory: './out', includeDetails: false },
      });
      expect(config.output?.formats).toEqual(['csv']);
    });

    it('preserves description when provided', () => {
      const config = mergeConfig({ name: 'test', description: 'Custom desc' });
      expect(config.description).toBe('Custom desc');
    });
  });

  describe('getEnabledMetrics', () => {
    it('returns only enabled metrics', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.6 },
          { name: 'b', enabled: false, weight: 0.4 },
          { name: 'c', enabled: true, weight: 0.4 },
        ],
      });
      const enabled = getEnabledMetrics(config);
      expect(enabled).toHaveLength(2);
      expect(enabled.map((m) => m.name)).toEqual(['a', 'c']);
    });

    it('returns empty array when all disabled', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: false, weight: 1.0 }],
      });
      expect(getEnabledMetrics(config)).toHaveLength(0);
    });

    it('returns all when all enabled', () => {
      const config = makeSuiteConfig();
      expect(getEnabledMetrics(config)).toHaveLength(config.metrics.length);
    });
  });

  describe('calculateOverallScore', () => {
    it('calculates weighted score', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.5 },
          { name: 'b', enabled: true, weight: 0.5 },
        ],
      });
      const scores = { a: 0.8, b: 0.6 };
      const result = calculateOverallScore(scores, config);
      expect(result).toBe(0.7);
    });

    it('ignores disabled metrics', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 1.0 },
          { name: 'b', enabled: false, weight: 0.0 },
        ],
      });
      const scores = { a: 0.9, b: 0.1 };
      expect(calculateOverallScore(scores, config)).toBe(0.9);
    });

    it('ignores missing scores', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0 }],
      });
      const scores: Record<string, number> = {};
      expect(calculateOverallScore(scores, config)).toBe(0);
    });

    it('normalizes by total weight of present scores', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.6 },
          { name: 'b', enabled: true, weight: 0.4 },
        ],
      });
      const scores = { a: 1.0 };
      const result = calculateOverallScore(scores, config);
      expect(result).toBe(1.0);
    });

    it('rounds to 3 decimal places', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0 }],
      });
      const scores = { a: 0.1234567 };
      const result = calculateOverallScore(scores, config);
      const decimals = result.toString().split('.')[1]?.length || 0;
      expect(decimals).toBeLessThanOrEqual(3);
    });
  });

  describe('checkThresholds', () => {
    it('passes when all scores meet thresholds', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0, threshold: 0.5 }],
      });
      const result = checkThresholds({ a: 0.8 }, config);
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when a score is below threshold', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0, threshold: 0.8 }],
      });
      const result = checkThresholds({ a: 0.5 }, config);
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.metric).toBe('a');
      expect(result.failures[0]?.score).toBe(0.5);
      expect(result.failures[0]?.threshold).toBe(0.8);
    });

    it('ignores disabled metrics', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: false, weight: 0.0, threshold: 0.9 }],
      });
      const result = checkThresholds({ a: 0.1 }, config);
      expect(result.passed).toBe(true);
    });

    it('ignores metrics without thresholds', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0 }],
      });
      const result = checkThresholds({ a: 0.0 }, config);
      expect(result.passed).toBe(true);
    });

    it('ignores metrics with no score provided', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.5, threshold: 0.8 },
          { name: 'b', enabled: true, weight: 0.5, threshold: 0.8 },
        ],
      });
      const result = checkThresholds({ a: 0.9 }, config);
      expect(result.passed).toBe(true);
    });

    it('reports multiple failures', () => {
      const config = makeSuiteConfig({
        metrics: [
          { name: 'a', enabled: true, weight: 0.5, threshold: 0.8 },
          { name: 'b', enabled: true, weight: 0.5, threshold: 0.8 },
        ],
      });
      const result = checkThresholds({ a: 0.5, b: 0.6 }, config);
      expect(result.failures).toHaveLength(2);
    });

    it('passes when score equals threshold', () => {
      const config = makeSuiteConfig({
        metrics: [{ name: 'a', enabled: true, weight: 1.0, threshold: 0.8 }],
      });
      const result = checkThresholds({ a: 0.8 }, config);
      expect(result.passed).toBe(true);
    });
  });
});

describe('runner', () => {
  describe('SuiteRunner', () => {
    it('creates with default config', () => {
      const runner = new SuiteRunner();
      expect(runner).toBeDefined();
    });

    it('creates with custom config', () => {
      const runner = new SuiteRunner({ concurrency: 10, timeoutMs: 30000 });
      expect(runner).toBeDefined();
    });

    describe('run', () => {
      it('returns completed status for successful evaluations', async () => {
        const runner = new SuiteRunner();
        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2')];
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        const result = await runner.run(trajectories, evaluator);

        expect(result.status).toBe('completed');
        expect(result.completedTrajectories).toBe(2);
        expect(result.failedTrajectories).toBe(0);
        expect(result.totalTrajectories).toBe(2);
      });

      it('returns a runId starting with eval-', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run(
          [makeTrajectory('t1')],
          vi.fn().mockResolvedValue(makeEvalResult()),
        );
        expect(result.runId).toMatch(/^eval-/);
      });

      it('returns startedAt and endedAt timestamps', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run(
          [makeTrajectory('t1')],
          vi.fn().mockResolvedValue(makeEvalResult()),
        );
        expect(result.startedAt).toBeDefined();
        expect(result.endedAt).toBeDefined();
      });

      it('tracks duration in milliseconds', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run(
          [makeTrajectory('t1')],
          vi.fn().mockResolvedValue(makeEvalResult()),
        );
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('returns partial status when some evaluations fail and continueOnError is true', async () => {
        const runner = new SuiteRunner({ continueOnError: true });
        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2')];
        const evaluator = vi
          .fn()
          .mockResolvedValueOnce(makeEvalResult())
          .mockRejectedValueOnce(new Error('Evaluation failed'));

        const result = await runner.run(trajectories, evaluator);

        expect(result.status).toBe('partial');
        expect(result.completedTrajectories).toBe(1);
        expect(result.failedTrajectories).toBe(1);
      });

      it('returns failed status when all evaluations fail', async () => {
        const runner = new SuiteRunner({ continueOnError: true });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));
        const trajectories = [makeTrajectory('t1')];

        const result = await runner.run(trajectories, evaluator);

        expect(result.status).toBe('failed');
        expect(result.failedTrajectories).toBe(1);
        expect(result.completedTrajectories).toBe(0);
      });

      it('throws when continueOnError is false and evaluation fails', async () => {
        const runner = new SuiteRunner({ continueOnError: false, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));

        await expect(
          runner.run([makeTrajectory('t1'), makeTrajectory('t2')], evaluator),
        ).rejects.toThrow('fail');
      });

      it('stores trajectory results with correct IDs', async () => {
        const runner = new SuiteRunner({ concurrency: 1 });
        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2')];
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        const result = await runner.run(trajectories, evaluator);

        expect(result.trajectoryResults).toHaveLength(2);
        const ids = result.trajectoryResults.map((r) => r.trajectoryId);
        expect(ids).toContain('t1');
        expect(ids).toContain('t2');
      });

      it('stores error messages for failed trajectories', async () => {
        const runner = new SuiteRunner({ continueOnError: true, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValueOnce(new Error('bad trajectory'));

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.trajectoryResults[0]?.error).toBe('bad trajectory');
      });

      it('stores empty result for failed trajectories', async () => {
        const runner = new SuiteRunner({ continueOnError: true, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.trajectoryResults[0]?.result.overall_score).toBe(0);
      });

      it('computes overall metrics from results', async () => {
        const runner = new SuiteRunner({ concurrency: 1 });
        const evaluator = vi.fn().mockResolvedValue(
          makeEvalResult({
            overall_score: 0.9,
            metrics: {
              faithfulness: 0.95,
              relevance: 0.85,
              tool_correctness: 0.9,
            },
            cost: 0.02,
          }),
        );

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.overallMetrics.overallScore).toBe(0.9);
        expect(result.overallMetrics.avgFaithfulness).toBe(0.95);
        expect(result.overallMetrics.avgRelevance).toBe(0.85);
      });

      it('handles empty trajectory list', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run([], vi.fn());

        expect(result.totalTrajectories).toBe(0);
        expect(result.completedTrajectories).toBe(0);
        expect(result.status).toBe('completed');
      });

      it('calls progress callback', async () => {
        const progressFn = vi.fn();
        const runner = new SuiteRunner({ concurrency: 1 }, progressFn);
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        await runner.run([makeTrajectory('t1')], evaluator);

        expect(progressFn).toHaveBeenCalled();
        const lastCall = progressFn.mock.calls[
          progressFn.mock.calls.length - 1
        ]?.[0] as ProgressUpdate;
        expect(lastCall.total).toBe(1);
        expect(lastCall.status).toBe('completed');
      });

      it('returns zero metrics when all results are errors', async () => {
        const runner = new SuiteRunner({ continueOnError: true, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.overallMetrics.overallScore).toBe(0);
        expect(result.overallMetrics.avgFaithfulness).toBe(0);
        expect(result.overallMetrics.avgRelevance).toBe(0);
        expect(result.overallMetrics.toolCorrectnessRate).toBe(0);
        expect(result.overallMetrics.avgCostPerTask).toBe(0);
      });

      it('processes trajectories in concurrent batches', async () => {
        const order: string[] = [];
        const runner = new SuiteRunner({ concurrency: 2 });

        const evaluator = vi.fn().mockImplementation(async (t: Trajectory) => {
          order.push(t.trajectory_id ?? '');
          return makeEvalResult();
        });

        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2'), makeTrajectory('t3')];

        await runner.run(trajectories, evaluator);

        expect(evaluator).toHaveBeenCalledTimes(3);
        expect(order).toHaveLength(3);
      });

      it('uses trajectory_id from trajectory object', async () => {
        const runner = new SuiteRunner({ concurrency: 1 });
        const traj = makeTrajectory('custom-id-42');
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        const result = await runner.run([traj], evaluator);

        expect(result.trajectoryResults[0]?.trajectoryId).toBe('custom-id-42');
      });
    });
  });

  describe('createSuiteRunner', () => {
    it('creates a SuiteRunner instance', () => {
      const runner = createSuiteRunner();
      expect(runner).toBeInstanceOf(SuiteRunner);
    });

    it('passes config to the runner', () => {
      const runner = createSuiteRunner({ concurrency: 20 });
      expect(runner).toBeInstanceOf(SuiteRunner);
    });
  });
});

describe('results', () => {
  let config: SuiteConfig;

  beforeEach(() => {
    config = makeSuiteConfig();
  });

  describe('ResultsAggregator', () => {
    it('constructs with a SuiteConfig', () => {
      expect(new ResultsAggregator(config)).toBeDefined();
    });

    describe('aggregate', () => {
      it('produces AggregatedResults with correct runId', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({ runId: 'run-agg-001' });
        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.runId).toBe('run-agg-001');
      });

      it('includes config in aggregated results', () => {
        const aggregator = new ResultsAggregator(config);
        const aggregated = aggregator.aggregate(makeEvalRunResult());
        expect(aggregated.config).toBe(config);
      });

      it('includes timestamp', () => {
        const aggregator = new ResultsAggregator(config);
        const aggregated = aggregator.aggregate(makeEvalRunResult());
        expect(aggregated.timestamp).toBeDefined();
        expect(() => new Date(aggregated.timestamp)).not.toThrow();
      });

      it('computes summary with pass rate', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({
                overall_score: 0.9,
                metrics: {
                  faithfulness: 0.9,
                  relevance: 0.9,
                  tool_correctness: 0.95,
                },
                cost: 0.01,
              }),
            },
          ],
          totalTrajectories: 1,
          completedTrajectories: 1,
          failedTrajectories: 0,
        });

        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.summary.totalTrajectories).toBe(1);
      });

      it('handles empty trajectory results', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [],
          totalTrajectories: 0,
        });
        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.trajectoryResults).toHaveLength(0);
        expect(aggregated.summary.passRate).toBe(0);
      });

      it('computes metric breakdown for each configured metric', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({
                metrics: {
                  faithfulness: 0.9,
                  relevance: 0.8,
                  tool_correctness: 0.95,
                },
                cost: 0.02,
              }),
            },
          ],
        });

        const aggregated = aggregator.aggregate(runResult);
        expect(Object.keys(aggregated.metricBreakdown)).toContain('faithfulness');
        expect(Object.keys(aggregated.metricBreakdown)).toContain('relevance');
      });

      it('computes stdDev in metric breakdown', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({ metrics: { faithfulness: 0.8 } }),
            },
            {
              trajectoryId: 't2',
              result: makeEvalResult({ metrics: { faithfulness: 1.0 } }),
            },
          ],
        });

        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.metricBreakdown.faithfulness?.stdDev).toBeGreaterThanOrEqual(0);
      });

      it('skips errored trajectory results in metric breakdown', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({ metrics: { faithfulness: 0.9 } }),
            },
            {
              trajectoryId: 't2',
              result: makeEvalResult(),
              error: 'timeout',
            },
          ],
        });

        const aggregated = aggregator.aggregate(runResult);
        if (aggregated.metricBreakdown.faithfulness) {
          expect(aggregated.metricBreakdown.faithfulness.avgScore).toBe(0.9);
        }
      });
    });

    describe('exportJSON', () => {
      it('exports valid JSON string', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const json = aggregator.exportJSON(results);
        expect(() => JSON.parse(json)).not.toThrow();
      });

      it('includes all top-level keys', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const parsed = JSON.parse(aggregator.exportJSON(results));
        expect(parsed).toHaveProperty('runId');
        expect(parsed).toHaveProperty('config');
        expect(parsed).toHaveProperty('overallMetrics');
        expect(parsed).toHaveProperty('metricBreakdown');
        expect(parsed).toHaveProperty('trajectoryResults');
        expect(parsed).toHaveProperty('summary');
        expect(parsed).toHaveProperty('timestamp');
      });
    });

    describe('exportJUnit', () => {
      it('produces XML starting with declaration', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('<?xml version="1.0"');
      });

      it('contains testsuite element', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('<testsuite');
        expect(xml).toContain('</testsuite>');
      });

      it('includes failure elements for failed trajectories', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              overallScore: 0.3,
              metricScores: { faithfulness: 0.3 },
              passed: false,
              errors: 'score too low',
            },
          ],
        });
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('<failure');
        expect(xml).toContain('score too low');
      });

      it('uses self-closing testcase for passed trajectories', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              overallScore: 0.9,
              metricScores: { faithfulness: 0.9 },
              passed: true,
            },
          ],
        });
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('/>');
      });
    });

    describe('exportCSV', () => {
      it('produces CSV with headers', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const csv = aggregator.exportCSV(results);
        const lines = csv.split('\n');
        expect(lines[0]).toContain('trajectory_id');
        expect(lines[0]).toContain('overall_score');
        expect(lines[0]).toContain('passed');
      });

      it('includes one row per trajectory', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults({
          trajectoryResults: [
            { trajectoryId: 't1', overallScore: 0.8, metricScores: {}, passed: true },
            { trajectoryId: 't2', overallScore: 0.6, metricScores: {}, passed: false },
          ],
        });
        const csv = aggregator.exportCSV(results);
        const lines = csv.split('\n').filter((l) => l.trim());
        expect(lines).toHaveLength(3);
      });

      it('includes metric columns', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const csv = aggregator.exportCSV(results);
        const headers = csv.split('\n')[0]?.split(',');
        for (const metric of config.metrics) {
          expect(headers).toContain(metric.name);
        }
      });
    });

    describe('exportMarkdown', () => {
      it('produces markdown with title', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('# Evaluation Results: test-suite');
      });

      it('includes run ID and timestamp', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('**Run ID:** run-001');
        expect(md).toContain('**Timestamp:**');
      });

      it('includes summary table', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('## Summary');
        expect(md).toContain('Total Trajectories');
        expect(md).toContain('Pass Rate');
      });

      it('includes metric breakdown table', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('## Metric Breakdown');
        expect(md).toContain('faithfulness');
      });
    });

    describe('export', () => {
      it('dispatches to exportJSON for json format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const json = aggregator.export(results, 'json');
        expect(() => JSON.parse(json)).not.toThrow();
      });

      it('dispatches to exportJUnit for junit format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const xml = aggregator.export(results, 'junit');
        expect(xml).toContain('<?xml');
      });

      it('dispatches to exportCSV for csv format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const csv = aggregator.export(results, 'csv');
        expect(csv).toContain('trajectory_id');
      });

      it('dispatches to exportMarkdown for markdown format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.export(results, 'markdown');
        expect(md).toContain('# Evaluation Results');
      });

      it('throws for unknown format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        expect(() => aggregator.export(results, 'unknown' as ExportFormat)).toThrow(
          'Unknown format: unknown',
        );
      });
    });
  });

  describe('createResultsAggregator', () => {
    it('creates a ResultsAggregator instance', () => {
      const aggregator = createResultsAggregator(config);
      expect(aggregator).toBeInstanceOf(ResultsAggregator);
    });
  });
});

describe('comparator', () => {
  describe('RunComparator', () => {
    it('creates with default parameters', () => {
      const comparator = new RunComparator();
      expect(comparator).toBeDefined();
    });

    it('creates with custom parameters', () => {
      const comparator = new RunComparator(0.01, 0.2);
      expect(comparator).toBeDefined();
    });

    describe('compare', () => {
      it('returns RunComparisonResult with correct run IDs', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({ runId: 'base-001' });
        const candidate = makeAggregatedResults({ runId: 'cand-001' });

        const result = comparator.compare(baseline, candidate);

        expect(result.baselineRunId).toBe('base-001');
        expect(result.candidateRunId).toBe('cand-001');
      });

      it('reports improved verdict when candidate scores higher', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.7 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('improved');
        expect(result.scoreDiff).toBeGreaterThan(0);
      });

      it('reports regressed verdict when candidate scores lower', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.7 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('regressed');
        expect(result.scoreDiff).toBeLessThan(0);
        expect(result.regressions.length).toBeGreaterThan(0);
      });

      it('reports unchanged when scores are similar', () => {
        const comparator = new RunComparator(0.05, 0.5);
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.8,
              maxScore: 0.9,
              stdDev: 0.03,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.86,
              minScore: 0.81,
              maxScore: 0.91,
              stdDev: 0.03,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('unchanged');
      });

      it('reports mixed verdict when some metrics improve and some regress', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.6,
              minScore: 0.5,
              maxScore: 0.7,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('mixed');
        expect(result.regressions.length).toBeGreaterThan(0);
        expect(result.improvements.length).toBeGreaterThan(0);
        expect(result.summary.recommendation).toBe('review');
      });

      it('computes metric diffs for matching metrics', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.metricDiffs).toHaveLength(1);
        expect(result.metricDiffs[0]?.metric).toBe('faithfulness');
        expect(result.metricDiffs[0]?.baseline).toBe(0.8);
        expect(result.metricDiffs[0]?.candidate).toBe(0.85);
        expect(result.metricDiffs[0]?.diff).toBe(0.05);
      });

      it('skips metrics that only exist in baseline', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
            extra_metric: {
              name: 'extra_metric',
              avgScore: 0.5,
              minScore: 0.4,
              maxScore: 0.6,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.2,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.metricDiffs).toHaveLength(1);
        expect(result.metricDiffs[0]?.metric).toBe('faithfulness');
      });

      it('calculates percent change correctly', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.8,
              maxScore: 1.0,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.metricDiffs[0]?.percentChange).toBe(12.5);
      });

      it('includes statistical significance result', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults();
        const candidate = makeAggregatedResults();

        const result = comparator.compare(baseline, candidate);

        expect(result.statisticalSignificance).toBeDefined();
        expect(result.statisticalSignificance.test).toBe('t-test');
        expect(result.statisticalSignificance.alpha).toBe(0.05);
        expect(typeof result.statisticalSignificance.pValue).toBe('number');
        expect(result.statisticalSignificance.confidenceInterval).toHaveLength(2);
        expect(typeof result.statisticalSignificance.significant).toBe('boolean');
      });

      it('classifies high severity regressions', () => {
        const comparator = new RunComparator(0.05, 0.01);
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.5,
              minScore: 0.4,
              maxScore: 0.6,
              stdDev: 0.05,
              passRate: 0.5,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.regressions.length).toBeGreaterThan(0);
        expect(result.regressions[0]?.severity).toBe('high');
      });

      it('classifies major improvements', () => {
        const comparator = new RunComparator(0.05, 0.01);
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.5,
              minScore: 0.4,
              maxScore: 0.6,
              stdDev: 0.05,
              passRate: 0.5,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.improvements.length).toBeGreaterThan(0);
        expect(result.improvements[0]?.significance).toBe('major');
      });

      it('generates key findings', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults();
        const candidate = makeAggregatedResults();

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.keyFindings.length).toBeGreaterThan(0);
      });

      it('recommends approve for improved runs', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.7 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);
        expect(['approve', 'review']).toContain(result.summary.recommendation);
      });

      it('recommends reject for regressed runs', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.6 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.6,
              minScore: 0.5,
              maxScore: 0.7,
              stdDev: 0.05,
              passRate: 0.8,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);
        expect(result.summary.recommendation).toBe('reject');
      });

      it('rounds scoreDiff to 3 decimal places', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.8333 }),
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9666 }),
        });

        const result = comparator.compare(baseline, candidate);
        const decimals = result.scoreDiff.toString().split('.')[1]?.length || 0;
        expect(decimals).toBeLessThanOrEqual(3);
      });
    });

    describe('generateVisualizationData', () => {
      it('produces VisualizationData with barChart', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.barChart).toHaveLength(1);
        expect(viz.barChart[0]?.metric).toBe('faithfulness');
        expect(viz.barChart[0]?.baseline).toBe(0.8);
        expect(viz.barChart[0]?.candidate).toBe(0.85);
      });

      it('produces waterfall data with cumulative sums', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.6,
              minScore: 0.5,
              maxScore: 0.7,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.waterfall).toHaveLength(2);
        expect(viz.waterfall[0]?.change).toBe(0.1);
        expect(viz.waterfall[0]?.cumulative).toBe(0.1);
        expect(viz.waterfall[1]?.cumulative).toBeCloseTo(0.0, 2);
      });

      it('produces heatmap with baseline and candidate entries', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.heatmap).toHaveLength(2);
        expect(viz.heatmap[0]?.category).toBe('baseline');
        expect(viz.heatmap[1]?.category).toBe('candidate');
      });

      it('returns empty arrays for comparison with no matching metrics', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            relevance: {
              name: 'relevance',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.barChart).toHaveLength(0);
        expect(viz.waterfall).toHaveLength(0);
        expect(viz.heatmap).toHaveLength(0);
      });
    });
  });

  describe('createRunComparator', () => {
    it('creates a RunComparator instance', () => {
      const comparator = createRunComparator();
      expect(comparator).toBeInstanceOf(RunComparator);
    });

    it('passes significance level', () => {
      const comparator = createRunComparator(0.01);
      expect(comparator).toBeInstanceOf(RunComparator);
    });

    it('passes both parameters', () => {
      const comparator = createRunComparator(0.01, 0.2);
      expect(comparator).toBeInstanceOf(RunComparator);
    });
  });
});
