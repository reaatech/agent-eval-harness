import { describe, expect, it } from 'vitest';
import {
  DEFAULT_METRICS,
  calculateOverallScore,
  checkThresholds,
  createDefaultConfig,
  getEnabledMetrics,
  mergeConfig,
  parseConfig,
  validateConfig,
} from './config.js';
import type { MetricConfig, SuiteConfig } from './config.js';

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
