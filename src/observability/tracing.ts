import {
  NodeTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import {
  trace,
  type Span,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  type Attributes,
  type AttributeValue,
} from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';

/**
 * Tracing configuration
 */
export interface TracingConfig {
  /** Service name */
  serviceName: string;
  /** Service version */
  version: string;
  /** Enable tracing */
  enabled: boolean;
  /** Exporter type */
  exporter: 'otlp' | 'zipkin' | 'console' | 'none';
  /** OTLP endpoint */
  otlpEndpoint?: string;
  /** Zipkin endpoint */
  zipkinEndpoint?: string;
  /** Sample rate (0-1) */
  sampleRate: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TracingConfig = {
  serviceName: 'agent-eval-harness',
  version: '1.0.0',
  enabled: true,
  exporter: 'console',
  sampleRate: 1.0,
};

/**
 * Tracing manager
 */
class TracingManager {
  private provider: NodeTracerProvider | null = null;
  private config: TracingConfig;
  private initialized = false;

  constructor(config: Partial<TracingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize tracing
   */
  init(): void {
    if (!this.config.enabled || this.initialized) {
      return;
    }

    this.provider = new NodeTracerProvider({
      resource: new Resource({
        'service.name': this.config.serviceName,
        'service.version': this.config.version,
      }),
    });

    // Add exporter
    switch (this.config.exporter) {
      case 'otlp':
        if (this.config.otlpEndpoint) {
          this.provider.addSpanProcessor(
            new BatchSpanProcessor(new OTLPTraceExporter({ url: this.config.otlpEndpoint })),
          );
        }
        break;
      case 'zipkin':
        if (this.config.zipkinEndpoint) {
          this.provider.addSpanProcessor(
            new BatchSpanProcessor(new ZipkinExporter({ url: this.config.zipkinEndpoint })),
          );
        }
        break;
      case 'console':
        this.provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
        break;
    }

    this.provider.register();
    this.initialized = true;
  }

  /**
   * Create a span for evaluation run
   */
  startEvalRunSpan(runId: string, config: unknown): Span {
    const tracer = trace.getTracer(this.config.serviceName);
    return tracer.startSpan('eval.run', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'eval.run_id': runId,
        'eval.config': JSON.stringify(config),
      },
    });
  }

  /**
   * Create a span for trajectory loading
   */
  startTrajectoryLoadSpan(path: string, format: string): Span {
    const tracer = trace.getTracer(this.config.serviceName);
    return tracer.startSpan('trajectory.load', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'trajectory.path': path,
        'trajectory.format': format,
      },
    });
  }

  /**
   * Create a span for judge evaluation
   */
  startJudgeSpan(model: string, metric: string): Span {
    const tracer = trace.getTracer(this.config.serviceName);
    return tracer.startSpan('judge.evaluate', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'judge.model': model,
        'judge.metric': metric,
      },
    });
  }

  /**
   * Create a span for gate evaluation
   */
  startGateSpan(gateCount: number): Span {
    const tracer = trace.getTracer(this.config.serviceName);
    return tracer.startSpan('gate.check', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'gate.count': gateCount,
      },
    });
  }

  /**
   * End span with result
   */
  endSpan(span: Span, result?: unknown, error?: Error): void {
    if (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
      if (result) {
        span.setAttribute('result', JSON.stringify(result));
      }
    }
    span.end();
  }

  /**
   * Get current span context for propagation
   */
  getCurrentContext(): unknown {
    return context.active();
  }

  /**
   * Inject context into headers
   */
  injectContext(headers: Record<string, string>): void {
    propagation.inject(context.active(), headers);
  }

  /**
   * Extract context from headers
   */
  extractContext(headers: Record<string, string>): unknown {
    return propagation.extract(context.active(), headers);
  }

  /**
   * Shutdown tracing
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      this.initialized = false;
    }
  }
}

/**
 * Console span exporter (for development)
 */
class ConsoleSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    for (const span of spans) {
      // eslint-disable-next-line no-console
      console.error('[Trace]', JSON.stringify(span, null, 2));
    }
    resultCallback({ code: 0 });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Singleton instance
 */
let tracingInstance: TracingManager | null = null;

/**
 * Get tracing manager instance
 */
export function getTracingManager(config?: Partial<TracingConfig>): TracingManager {
  if (!tracingInstance) {
    tracingInstance = new TracingManager(config);
    tracingInstance.init();
  }
  return tracingInstance;
}

/**
 * Wrap function with tracing
 */
export function withTracing<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  const tracer = trace.getTracer('agent-eval-harness');

  const spanOptions: Parameters<typeof tracer.startActiveSpan>[1] = { kind: SpanKind.INTERNAL };
  if (attributes) {
    spanOptions.attributes = attributes;
  }

  return tracer.startActiveSpan(spanName, spanOptions, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }) as Promise<T>;
}

/**
 * Add attributes to current span
 */
export function addSpanAttributes(attributes: Attributes): void {
  const span = trace.getActiveSpan();
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      const attrValue: AttributeValue =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : (value as AttributeValue);
      span.setAttribute(key, attrValue);
    }
  }
}
