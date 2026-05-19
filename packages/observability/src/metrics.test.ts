import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('metrics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('getMetricsManager', () => {
    it('creates a new instance with default config', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager();
      expect(manager).toBeDefined();
    });

    it('creates a new instance with custom config', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ serviceName: 'custom', enabled: true });
      expect(manager).toBeDefined();
    });

    it('returns the same instance on subsequent calls', async () => {
      const mod = await import('./metrics.js');
      const m1 = mod.getMetricsManager({ serviceName: 'first' });
      const m2 = mod.getMetricsManager({ serviceName: 'second' });
      expect(m1).toBe(m2);
    });

    it('creates instance with enabled false', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: false });
      expect(manager).toBeDefined();
    });

    it('initializes with otlp exporter', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true, exporter: 'otlp' });
      expect(manager).toBeDefined();
    });

    it('initializes with prometheus exporter', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true, exporter: 'prometheus' });
      expect(manager).toBeDefined();
    });

    it('handles enabled=true and records metrics', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({
        enabled: true,
        exporter: 'console',
        exportInterval: 100,
      });
      expect(manager).toBeDefined();

      manager.recordRun('success');
      manager.recordTrajectories('test-dataset');
      manager.recordJudgeCall('gpt-4', 'success');
      manager.recordJudgeCost('gpt-4', 0.05);
      manager.recordCostPerTask('classification', 0.02);
      manager.recordGateResult('quality-gate', true);
      manager.recordLatencyP99('llm', 1200);
    });
  });

  describe('recordRun', () => {
    it('records a successful run', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordRun('success')).not.toThrow();
    });

    it('records a failure run', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordRun('failure')).not.toThrow();
    });

    it('records a partial run with custom count', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordRun('partial', 3)).not.toThrow();
    });
  });

  describe('recordTrajectories', () => {
    it('records trajectories with default count', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordTrajectories('dataset-a')).not.toThrow();
    });

    it('records trajectories with custom count', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordTrajectories('dataset-b', 10)).not.toThrow();
    });
  });

  describe('recordJudgeCall', () => {
    it('records a successful judge call', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordJudgeCall('claude-opus', 'success')).not.toThrow();
    });

    it('records a failed judge call', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordJudgeCall('gpt-4', 'failure')).not.toThrow();
    });
  });

  describe('recordJudgeCost', () => {
    it('records judge cost with model', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordJudgeCost('claude-sonnet', 0.15)).not.toThrow();
    });
  });

  describe('recordCostPerTask', () => {
    it('records cost per task', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordCostPerTask('eval', 0.03)).not.toThrow();
    });
  });

  describe('recordGateResult', () => {
    it('records passed gate', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordGateResult('quality', true)).not.toThrow();
    });

    it('records failed gate', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordGateResult('cost', false)).not.toThrow();
    });
  });

  describe('recordLatencyP99', () => {
    it('records latency with component', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordLatencyP99('tool', 500)).not.toThrow();
    });
  });

  describe('recordBatchMetrics', () => {
    it('records all metric types in batch', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() =>
        manager.recordBatchMetrics({
          runs: { status: 'success' },
          trajectories: { dataset: 'test', count: 5 },
          judgeCalls: { model: 'gpt-4', status: 'success' },
          judgeCost: { model: 'gpt-4', cost: 0.1 },
          costPerTask: { taskType: 'eval', cost: 0.02 },
          gateResult: { gateName: 'quality', passed: true },
          latencyP99: { component: 'llm', latencyMs: 800 },
        }),
      ).not.toThrow();
    });

    it('handles partial batch metrics', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() =>
        manager.recordBatchMetrics({
          runs: { status: 'failure', count: 2 },
        }),
      ).not.toThrow();
    });

    it('handles empty batch', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      expect(() => manager.recordBatchMetrics({})).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('shuts down the provider', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('forceFlush', () => {
    it('forces flush on provider', async () => {
      const { getMetricsManager } = await import('./metrics.js');
      const manager = getMetricsManager({ enabled: true });
      await expect(manager.forceFlush()).resolves.toBeUndefined();
    });
  });

  describe('recordMetric', () => {
    it('records a metric when provider exists', async () => {
      const { getMetricsManager, recordMetric } = await import('./metrics.js');
      getMetricsManager({ enabled: true });
      expect(() => recordMetric('test.metric', 42, { env: 'test' })).not.toThrow();
    });

    it('does not throw when no provider', async () => {
      const { recordMetric } = await import('./metrics.js');
      expect(() => recordMetric('test.metric', 1)).not.toThrow();
    });
  });

  describe('incrementCounter', () => {
    it('increments a counter when provider exists', async () => {
      const { getMetricsManager, incrementCounter } = await import('./metrics.js');
      getMetricsManager({ enabled: true });
      expect(() => incrementCounter('test.counter', 1, { env: 'test' })).not.toThrow();
    });

    it('does not throw when no provider', async () => {
      const { incrementCounter } = await import('./metrics.js');
      expect(() => incrementCounter('test.counter')).not.toThrow();
    });

    it('increments with custom value and no attributes', async () => {
      const { getMetricsManager, incrementCounter } = await import('./metrics.js');
      getMetricsManager({ enabled: true });
      expect(() => incrementCounter('test.counter', 5)).not.toThrow();
    });
  });
});
