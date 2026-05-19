import { trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tracing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('getTracingManager', () => {
    it('creates a new instance with default config', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager();
      expect(manager).toBeDefined();
    });

    it('creates a new instance with custom config', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ serviceName: 'custom', enabled: true });
      expect(manager).toBeDefined();
    });

    it('returns the same instance on subsequent calls', async () => {
      const mod = await import('./tracing.js');
      const m1 = mod.getTracingManager({ serviceName: 'first' });
      const m2 = mod.getTracingManager({ serviceName: 'second' });
      expect(m1).toBe(m2);
    });

    it('creates instance with enabled false', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: false });
      expect(manager).toBeDefined();
    });
  });

  describe('span creation', () => {
    it('creates an eval run span', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true, exporter: 'console' });
      const span = manager.startEvalRunSpan('run-1', { model: 'gpt-4' });
      expect(span).toBeDefined();
      expect(span.spanContext().traceId).toBeDefined();
      span.end();
    });

    it('creates a trajectory load span', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const span = manager.startTrajectoryLoadSpan('/path/to/traj.jsonl', 'jsonl');
      expect(span).toBeDefined();
      span.end();
    });

    it('creates a judge span', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const span = manager.startJudgeSpan('claude-opus', 'faithfulness');
      expect(span).toBeDefined();
      span.end();
    });

    it('creates a gate span', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const span = manager.startGateSpan(5);
      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('endSpan', () => {
    it('ends a span with OK status and no result', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const span = manager.startEvalRunSpan('test', {});
      expect(() => manager.endSpan(span)).not.toThrow();
    });

    it('ends a span with OK status and result', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const span = manager.startEvalRunSpan('test', {});
      expect(() => manager.endSpan(span, { score: 0.95 })).not.toThrow();
    });

    it('ends a span with error', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const span = manager.startEvalRunSpan('test', {});
      expect(() => manager.endSpan(span, undefined, new Error('test error'))).not.toThrow();
    });
  });

  describe('context methods', () => {
    it('getCurrentContext returns a context', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const ctx = manager.getCurrentContext();
      expect(ctx).toBeDefined();
    });

    it('injectContext adds headers', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const headers: Record<string, string> = {};
      expect(() => manager.injectContext(headers)).not.toThrow();
    });

    it('extractContext returns context from headers', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      const headers: Record<string, string> = {};
      const ctx = manager.extractContext(headers);
      expect(ctx).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('shuts down the provider', async () => {
      const { getTracingManager } = await import('./tracing.js');
      const manager = getTracingManager({ enabled: true });
      await expect(manager.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('init with exporters', () => {
    it('initializes with otlp exporter when endpoint is set', async () => {
      const mod = await import('./tracing.js');
      const manager = mod.getTracingManager({
        enabled: true,
        exporter: 'otlp',
        otlpEndpoint: 'http://localhost:4318/v1/traces',
      });
      expect(manager).toBeDefined();
    });

    it('initializes with otlp exporter without endpoint', async () => {
      const mod = await import('./tracing.js');
      const manager = mod.getTracingManager({
        enabled: true,
        exporter: 'otlp',
      });
      expect(manager).toBeDefined();
    });

    it('initializes with zipkin exporter when endpoint is set', async () => {
      const mod = await import('./tracing.js');
      const manager = mod.getTracingManager({
        enabled: true,
        exporter: 'zipkin',
        zipkinEndpoint: 'http://localhost:9411/api/v2/spans',
      });
      expect(manager).toBeDefined();
    });

    it('initializes with zipkin exporter without endpoint', async () => {
      const mod = await import('./tracing.js');
      const manager = mod.getTracingManager({
        enabled: true,
        exporter: 'zipkin',
      });
      expect(manager).toBeDefined();
    });

    it('initializes with console exporter', async () => {
      const mod = await import('./tracing.js');
      const manager = mod.getTracingManager({
        enabled: true,
        exporter: 'console',
      });
      expect(manager).toBeDefined();
    });
  });

  describe('withTracing', () => {
    it('wraps a successful async function', async () => {
      const { withTracing } = await import('./tracing.js');
      const result = await withTracing('test-span', async (span) => {
        expect(span).toBeDefined();
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('wraps an async function that throws', async () => {
      const { withTracing } = await import('./tracing.js');
      await expect(
        withTracing('failing-span', async () => {
          throw new Error('something went wrong');
        }),
      ).rejects.toThrow('something went wrong');
    });

    it('includes attributes for the span', async () => {
      const { withTracing } = await import('./tracing.js');
      const result = await withTracing(
        'attr-span',
        async (span) => {
          return span.spanContext().traceId;
        },
        { key1: 'value1', key2: 42 },
      );
      expect(result).toBeDefined();
    });
  });

  describe('addSpanAttributes', () => {
    it('adds attributes to the current active span', async () => {
      const { addSpanAttributes } = await import('./tracing.js');
      // Get tracer and make the span active
      const tracer = trace.getTracer('test');
      await tracer.startActiveSpan('parent', async (parentSpan) => {
        addSpanAttributes({ key1: 'value1', key2: 42, flag: true });
        parentSpan.end();
      });
    });

    it('does nothing when no active span', async () => {
      const { addSpanAttributes } = await import('./tracing.js');
      expect(() => addSpanAttributes({ key1: 'value1' })).not.toThrow();
    });
  });
});
